import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { env } from "../config.js";
import type { ChatRequest } from "../chat/contracts.js";
import { logEvent } from "../chat/logger.js";
import { createPresentation } from "../db/repositories/presentationsRepo.js";
import {
  BACKOFF_MS,
  RETRY_ATTEMPTS,
  TOOL_TIMEOUT_MS,
  TOTAL_REQUEST_BUDGET_MS,
  delay,
  isRetryable,
  jitter,
  withTimeout,
} from "../chat/runtimePolicy.js";
import { buildSystemPrompt, type ModeOptions } from "./systemPrompt.js";
import { getChatModel } from "./llmClient.js";
import { skillRegistry } from "./skillRegistry.js";
import { toolRegistry, toolSchemas, type ToolName } from "./toolRegistry.js";
import { buildAgentPlan, decideNextAgentAction } from "./llmPlanner.js";
import type { AgentPlan, AgentRunResult, AgentStepResult, AgentUiAction } from "./types.js";

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type ToolOutcome = {
  status: "success" | "error";
  latencyMs: number;
  attempts: number;
  tool: ToolName;
  toolInput: string;
  data: Record<string, unknown>;
  citation?: { label: string; source: string; uri?: string };
  errorMessage?: string;
};

function resolveActiveModes(request: ChatRequest): ModeOptions {
  return {
    research: request.context?.modes?.research ?? false,
  };
}

function resolveAllowedTools(modes: ModeOptions): ToolName[] {
  return modes.research ? ["search_api"] : [];
}

async function executeToolWithRetry(
  tool: ToolName,
  toolInput: string,
  correlationId: string,
): Promise<ToolOutcome> {
  const start = Date.now();
  let attempt = 0;

  while (attempt <= RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      const runTool = toolRegistry[tool] as (q: string) => Promise<{
        tool: string;
        version: string;
        data: Record<string, unknown>;
        citation?: { label: string; source: string; uri?: string };
      }>;
      const result = await withTimeout(runTool(toolInput), TOOL_TIMEOUT_MS);
      const elapsed = Date.now() - start;
      logEvent("info", "agent.tool.success", correlationId, {
        tool,
        tool_version: result.version,
        attempt,
        latency_ms: elapsed,
      });
      return {
        status: "success",
        latencyMs: elapsed,
        attempts: attempt,
        tool,
        toolInput,
        data: result.data as Record<string, unknown>,
        citation: result.citation,
      };
    } catch (error) {
      const retryable = isRetryable(error);
      logEvent(retryable ? "warn" : "error", "agent.tool.failure", correlationId, {
        tool,
        attempt,
        retryable,
        error_message: error instanceof Error ? error.message : "unknown_error",
      });
      if (!retryable || attempt > RETRY_ATTEMPTS) {
        return {
          status: "error",
          latencyMs: Date.now() - start,
          attempts: attempt,
          tool,
          toolInput,
          data: {},
          errorMessage: error instanceof Error ? error.message : "unknown_error",
        };
      }
      const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] + jitter();
      await delay(backoff);
    }
  }

  return {
    status: "error",
    latencyMs: Date.now() - start,
    attempts: RETRY_ATTEMPTS + 1,
    tool,
    toolInput,
    data: {},
    errorMessage: "retry_exhausted",
  };
}

function sanitizePresentationHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

function isValidPresentationHtml(html: string): boolean {
  const normalized = html.trim().toLowerCase();
  if (!normalized.includes("<html") && !normalized.includes("<section")) {
    return false;
  }
  const hasSlide = /<section[^>]*data-slide="\d+"[^>]*>/i.test(html);
  const hasHeading = /<h2[\s>][\s\S]*?<\/h2>/i.test(html);
  const hasList = /<ul[\s>][\s\S]*?<\/ul>/i.test(html);
  return hasSlide && hasHeading && hasList;
}

const TOOL_STATUS_MESSAGES: Partial<Record<string, string>> = {
  search_api: "Searching the web…",
};

// ─── Shared artefact persistence helper ───────────────────────────────────────

async function persistArtefactAction(
  action: { document_type: string; title: string; summary: string; html: string },
  sessionId: string,
  prompt: string,
  correlationId: string,
  meta: Record<string, unknown>,
): Promise<{ message: string; uiActions: AgentUiAction[] }> {
  const sanitizedHtml = sanitizePresentationHtml(action.html);
  if (!isValidPresentationHtml(sanitizedHtml)) {
    return {
      message:
        "I generated a presentation but the HTML structure was invalid for presentation rendering. Please retry with a more specific brief.",
      uiActions: [],
    };
  }
  const presentationId = makeId("pres");
  await createPresentation({
    id: presentationId,
    sessionId,
    title: action.title,
    prompt,
    htmlContent: sanitizedHtml,
    metadataJson: { source: "agent_artefact_action", document_type: action.document_type, ...meta },
  });
  logEvent("info", "agent.artefact.generated", correlationId, {
    document_type: action.document_type,
    title: action.title,
    presentation_id: presentationId,
    ...meta,
  });
  return {
    message: action.summary,
    uiActions: [
      {
        id: `action-presentation-view-${presentationId}`,
        type: "button",
        title: `View Presentation: ${action.title}`,
        description: "Open generated presentation and export to PDF/PPTX.",
        buttonLabel: "View Presentation",
        href: `/viewer/${presentationId}`,
      },
    ],
  };
}

export async function runAgent(
  request: ChatRequest,
  correlationId: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
  onStatus?: (phase: string, message: string) => void,
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const activeModes = resolveActiveModes(request);
  const allowedTools = resolveAllowedTools(activeModes);
  const systemPrompt = buildSystemPrompt(activeModes);
  const maxToolCalls = env.AGENT_MAX_TOOL_CALLS;

  logEvent("info", "agent.mode", correlationId, {
    research: activeModes.research,
    allowed_tools: allowedTools,
  });

  const toolResults: ToolOutcome[] = [];
  const stepResults: AgentStepResult[] = [];
  let finalMessage = "";
  let finalUiActions: AgentUiAction[] = [];
  let finalSummary: string | undefined;
  let finalFollowUp: string | undefined;
  let finalShowSources: boolean | undefined;
  let toolCalls = 0;
  let skillCalls = 0;

  // ─── Phase 1: Plan-and-execute ─────────────────────────────────────────────
  // Ask the LLM once to produce an ordered step plan, then execute it directly
  // without a per-step planning call. This cuts LLM round-trips from O(N) to 2
  // for a typical N-tool research task (1 plan call + 1 final synthesis call).
  // If planning fails or returns null, we fall through to the reactive loop.

  // Show "Thinking…" only if planning takes longer than the threshold.
  // This avoids a flash for quick conversational replies while giving genuine
  // live feedback during longer research planning calls.
  const THINKING_DELAY_MS = 800;
  let thinkingTimer: ReturnType<typeof setTimeout> | null = onStatus
    ? setTimeout(() => { onStatus("thinking", "Thinking…"); thinkingTimer = null; }, THINKING_DELAY_MS)
    : null;

  const plan: AgentPlan | null = await buildAgentPlan(
    request.prompt,
    correlationId,
    history,
    allowedTools,
    systemPrompt,
  );

  // Cancel the timer if planning returned before the threshold fired.
  if (thinkingTimer !== null) {
    clearTimeout(thinkingTimer);
    thinkingTimer = null;
  }

  if (plan) {
    // Only emit "Mapping out steps…" when the plan involves real tool/skill work.
    // A respond-only plan (conversational reply) needs no further status.
    const hasWork = plan.steps.some((s) => s.type === "call_skill" || s.type === "call_tool");
    if (hasWork) {
      onStatus?.("planning", "Mapping out steps…");
    }
    logEvent("info", "agent.plan.executing", correlationId, { intent: plan.intent, total_steps: plan.steps.length });

    for (const plannedStep of plan.steps) {
      if (Date.now() - startedAt >= TOTAL_REQUEST_BUDGET_MS) break;

      if (plannedStep.type === "call_skill") {
        const skillEntry = skillRegistry[plannedStep.skill];
        if (!skillEntry) {
          logEvent("warn", "agent.skill.not_found", correlationId, { skill: plannedStep.skill });
          continue;
        }
        const skillLabel = plannedStep.skill.replace(/_/g, " ");
        onStatus?.("skill", `Loading ${skillLabel} skill…`);
        logEvent("info", "agent.skill.loaded", correlationId, { skill: plannedStep.skill });
        stepResults.push({
          step: plannedStep.step,
          tool: `call_skill:${plannedStep.skill}`,
          tool_input: plannedStep.skill,
          status: "success",
          data: { skill: plannedStep.skill, instructions: skillEntry.instructions },
        });
        skillCalls += 1;

      } else if (plannedStep.type === "call_tool") {
        if (toolCalls >= maxToolCalls) continue;
        const toolStatusMsg = TOOL_STATUS_MESSAGES[plannedStep.tool] ?? `Running ${plannedStep.tool}…`;
        onStatus?.("tool", toolStatusMsg);
        const result = await executeToolWithRetry(plannedStep.tool, plannedStep.tool_input, correlationId);
        toolCalls += 1;
        toolResults.push(result);
        stepResults.push({
          step: plannedStep.step,
          tool: result.tool,
          tool_input: result.toolInput,
          status: result.status,
          data: result.data,
          citation: result.citation,
          error_message: result.errorMessage,
        });

      } else if (plannedStep.type === "respond" || plannedStep.type === "artefact") {
        // Only emit status when there were actual tool/skill steps to collate.
        // Skip for pure conversational turns (no tool calls = nothing to aggregate).
        if (stepResults.length > 0) {
          onStatus?.("responding", "Collating response…");
        }
        const action = await decideNextAgentAction(
          request.prompt,
          correlationId,
          history,
          stepResults,
          systemPrompt,
          allowedTools,
          true, // forceRespond
        );
        if (action?.type === "respond") {
          finalMessage = action.message_text;
          finalUiActions = action.ui_actions ?? [];
          finalSummary = action.summary;
          finalFollowUp = action.follow_up;
          finalShowSources = action.show_sources;
        } else if (action?.type === "artefact") {
          // Synthesis confirmed this is a document — show the appropriate status now.
          onStatus?.("artefact", "Generating document…");
          try {
            const persisted = await persistArtefactAction(
              action,
              request.session_id,
              request.prompt,
              correlationId,
              { planned: true },
            );
            finalMessage = persisted.message;
            finalUiActions = persisted.uiActions;
          } catch (error) {
            logEvent("warn", "agent.artefact.failed", correlationId, {
              error_message: error instanceof Error ? error.message : "unknown_error",
            });
            finalMessage = "I could not persist the generated presentation artefact right now. Please retry.";
          }
        }
        break;
      }
    }
  }

  // ─── Phase 2: Native tool-calling fallback ────────────────────────────────
  // Runs when Phase 1 (plan-and-execute) did not produce a final message.
  // Uses the provider's native tool-call wire format — no JSON-in-text parsing —
  // for reliable, schema-enforced tool dispatch.
  // Skills are not exposed as native tools; their instructions are injected into
  // the SystemMessage of the synthesis call via decideNextAgentAction.
  if (!finalMessage && allowedTools.length > 0) {
    const nativeModel = getChatModel();
    if (nativeModel) {
      const activeSchemas = toolSchemas.filter((s) =>
        (allowedTools as string[]).includes(s.function.name),
      );
      if (activeSchemas.length > 0) {
        const modelWithTools = nativeModel.bindTools(activeSchemas);
        const conv: BaseMessage[] = [
          new SystemMessage(systemPrompt),
          new HumanMessage(request.prompt),
        ];

        while (toolCalls < maxToolCalls) {
          if (Date.now() - startedAt >= TOTAL_REQUEST_BUDGET_MS) break;

          let nativeResponse: AIMessage;
          try {
            nativeResponse = (await modelWithTools.invoke(conv)) as AIMessage;
          } catch (err) {
            logEvent("warn", "agent.native.llm_error", correlationId, {
              error_message: err instanceof Error ? err.message : "unknown_error",
            });
            break;
          }

          type NativeToolCall = { name: string; args: Record<string, unknown>; id: string };
          const nativeCalls = (nativeResponse.tool_calls ?? []) as NativeToolCall[];
          if (nativeCalls.length === 0) break; // No tool calls — proceed to synthesis

          conv.push(nativeResponse); // Append AIMessage containing tool_calls

          for (const tc of nativeCalls) {
            if (toolCalls >= maxToolCalls) break;
            const toolName = tc.name as ToolName;
            if (!(allowedTools as string[]).includes(toolName)) continue;

            const toolInput =
              typeof tc.args.query === "string" ? tc.args.query : JSON.stringify(tc.args);
            const toolStatusMsg =
              TOOL_STATUS_MESSAGES[toolName as keyof typeof TOOL_STATUS_MESSAGES] ??
              `Running ${toolName}…`;
            onStatus?.("tool", toolStatusMsg);

            const result = await executeToolWithRetry(toolName, toolInput, correlationId);
            toolCalls += 1;
            toolResults.push(result);
            const stepNum = stepResults.length + 1;
            stepResults.push({
              step: stepNum,
              tool: result.tool,
              tool_input: result.toolInput,
              status: result.status,
              data: result.data,
              citation: result.citation,
              error_message: result.errorMessage,
            });
            conv.push(
              new ToolMessage({
                content:
                  result.status === "success"
                    ? JSON.stringify(result.data)
                    : result.errorMessage ?? "Tool returned an error.",
                tool_call_id: tc.id ?? "unknown",
              }),
            );
          }
        }
      }
    }
  }

  // ─── Synthesis ─────────────────────────────────────────────────────────────
  // Always runs if neither Phase 1 nor Phase 2 set finalMessage.
  // Uses decideNextAgentAction(forceRespond=true) so artefact actions are
  // preserved regardless of the execution path taken above.
  if (!finalMessage) {
    onStatus?.("responding", "Collating response…");
    const forcedResponse = await decideNextAgentAction(
      request.prompt,
      correlationId,
      history,
      stepResults,
      systemPrompt,
      allowedTools,
      true,
    );

    if (forcedResponse?.type === "respond") {
      finalMessage = forcedResponse.message_text;
      finalUiActions = forcedResponse.ui_actions ?? [];
      finalSummary = forcedResponse.summary;
      finalFollowUp = forcedResponse.follow_up;
      finalShowSources = forcedResponse.show_sources;
    } else if (forcedResponse?.type === "artefact") {
      try {
        const persisted = await persistArtefactAction(
          forcedResponse,
          request.session_id,
          request.prompt,
          correlationId,
          { generated_in_forced_step: true },
        );
        finalMessage = persisted.message;
        finalUiActions = persisted.uiActions;
      } catch (error) {
        logEvent("warn", "agent.artefact.failed_forced", correlationId, {
          error_message: error instanceof Error ? error.message : "unknown_error",
        });
        finalMessage =
          "I could not persist the generated presentation artefact right now. Please retry.";
      }
    }
  }

  if (!finalMessage) {
    finalMessage =
      "I could not complete the request with a valid final response right now. Please retry with a narrower prompt.";
  }

  // Build per-hit citations from all search results so [cite:N] markers in the
  // message text map to the correct source by zero-based index.
  const citations = stepResults
    .filter((s) => s.tool === "search_api" && s.status === "success" && Array.isArray(s.data?.hits))
    .flatMap((s) => {
      const hits = s.data.hits as Array<{
        title?: string;
        snippet?: string;
        url?: string;
        source?: string;
        image?: string;
      }>;
      return hits.map((h) => ({
        label: h.source?.trim() || "Source",
        source: h.title?.trim() || "Untitled",
        uri: h.url?.trim() || undefined,
        image: h.image?.trim() || undefined,
      }));
    });

  const skillTrace = stepResults
    .filter((s) => s.tool.startsWith("call_skill:"))
    .map((s) => ({
      tool: s.tool,
      status: (s.status === "success" ? "success" : "error") as "success" | "error",
      latency_ms: 0,
      attempts: 1,
    }));

  const trace = [
    ...skillTrace,
    ...toolResults.map((result) => ({
      tool: result.tool,
      status: (result.status === "success" ? "success" : "error") as "success" | "error",
      latency_ms: result.latencyMs,
      attempts: result.attempts,
    })),
  ];

  const hasErrors = toolResults.some((result) => result.status === "error");

  return {
    message_text: hasErrors ? `${finalMessage} (Some tool steps failed. Ref: ${correlationId}.)` : finalMessage,
    ui_actions: finalUiActions,
    citations,
    tool_trace: trace,
    summary: finalSummary,
    follow_up: finalFollowUp,
    show_sources: finalShowSources,
    errors: hasErrors
      ? [
          {
            reference_id: correlationId,
            user_message: "One or more tool steps failed.",
            what_i_tried: "I executed model-selected tool steps with timeout/retry controls.",
            next_options: ["Retry now", "Try a narrower prompt"],
          },
        ]
      : [],
  };
}
