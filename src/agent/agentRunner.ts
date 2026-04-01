import type { ArtifactType } from "../artifacts/types.js";
import { materializeArtifactFile } from "../artifacts/generators.js";
import type { AuthenticatedUser } from "../auth/types.js";
import { env } from "../config.js";
import type { ChatRequest } from "../chat/contracts.js";
import { logEvent } from "../chat/logger.js";
import { createArtifact } from "../db/repositories/artifactsRepo.js";
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
import { skillRegistry, type SkillName } from "./skillRegistry.js";
import { createToolRegistry, resolveAllowedTools, skillToolAccess, type ToolExecutor, type ToolName } from "./toolRegistry.js";
import { decideNextAgentAction } from "./llmPlanner.js";
import { routeRequest } from "./router.js";
import type { AgentAction, AgentRunResult, AgentStepResult, AgentToolInput, AgentUiAction } from "./types.js";
import type { ToolResultEnvelope } from "../tools/types.js";

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type ToolOutcome = {
  status: "success" | "blocked" | "error";
  latencyMs: number;
  attempts: number;
  tool: ToolName;
  toolInput: AgentToolInput;
  data: ToolResultEnvelope<Record<string, unknown>>;
  citation?: { label: string; source: string; uri?: string };
  errorMessage?: string;
};

type AgentRuntimeDeps = {
  decideAction?: typeof decideNextAgentAction;
  executeTool?: (
    tool: ToolName,
    toolInput: AgentToolInput,
    correlationId: string,
    user: AuthenticatedUser,
    ipAddress?: string,
  ) => Promise<ToolOutcome>;
  persistArtifact?: typeof persistArtifactAction;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function makeToolCallKey(tool: ToolName, toolInput: AgentToolInput): string {
  return `${tool}:${stableStringify(toolInput)}`;
}

function getLastTerminalToolStep(steps: AgentStepResult[]): AgentStepResult | undefined {
  return [...steps]
    .reverse()
    .find(
      (step) =>
        !step.tool.startsWith("activated_skill:") &&
        (step.status === "success" || step.status === "blocked" || step.status === "error"),
    );
}

function getLatestUserSafeError(steps: AgentStepResult[]): string | null {
  const latest = getLastTerminalToolStep(steps);
  if (!latest || !latest.data || typeof latest.data !== "object") {
    return null;
  }

  const candidate = latest.data as {
    user_safe_error?: unknown;
    summary?: unknown;
  };

  if (typeof candidate.user_safe_error === "string" && candidate.user_safe_error.trim()) {
    return candidate.user_safe_error.trim();
  }

  if (latest.status === "error" && typeof candidate.summary === "string" && candidate.summary.trim()) {
    return candidate.summary.trim();
  }

  return null;
}

function formatUserSafeToolError(tool: ToolName, errorMessage: string): string {
  if (tool === "execute_query") {
    if (errorMessage.includes("connection refused")) {
      return "I can't reach the Aletia HR Platform right now. Please check that the service is running and try again.";
    }
    if (errorMessage.includes("request timed out")) {
      return "The Aletia HR Platform is not responding right now. Please try again in a moment.";
    }
    if (errorMessage.includes("authentication failed")) {
      return "I couldn't access the Aletia HR Platform because the connection credentials appear to be invalid.";
    }
    if (errorMessage.includes("bad request") || errorMessage.includes("invalid filter")) {
      return "I couldn't complete that HR lookup because the request details were invalid.";
    }
    return "I couldn't complete that HR lookup because the Aletia service returned an error.";
  }

  if (tool === "search_api") {
    if (errorMessage.includes("timeout")) {
      return "I couldn't finish the web search right now because the search service timed out.";
    }
    return "I couldn't complete the web search right now.";
  }

  return "I couldn't complete that step right now.";
}

function getStructuredToolInput(
  tool: ToolName,
  toolInput: AgentToolInput,
): Record<string, unknown> | null {
  if (tool !== "execute_query" || !toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) {
    return null;
  }

  return toolInput as Record<string, unknown>;
}

function isSimpleLookupPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasLookupIntent =
    /\b(show|list|find|get|give me|who is|who are|what is|tell me|display)\b/.test(normalized) &&
    /\b(employee|employees|leave|payroll|salary|performance|review|employment history|career history|hr system)\b/.test(normalized);

  if (!hasLookupIntent) {
    return false;
  }

  const complexSignals =
    /\b(compare|comparison|versus|vs|benchmark|market|current trends|latest|recent|online|web|search|research|report|brief|deck|presentation|combine|merge|summari[sz]e and|and then|along with)\b/.test(
      normalized,
    );

  return !complexSignals;
}

function shouldForceRespondAfterSuccessfulTool(prompt: string, result: ToolOutcome): boolean {
  if (result.status !== "success") {
    return false;
  }

  if (result.data.kind === "status") {
    return true;
  }

  if (result.data.kind === "record" || result.data.kind === "list") {
    return isSimpleLookupPrompt(prompt);
  }

  return false;
}

type CompletionDirective = {
  forceRespond: boolean;
  message?: string;
};

function getCompletionDirective(prompt: string, outcome: ToolOutcome): CompletionDirective {
  if (outcome.data.kind === "status") {
    const payload = outcome.data.payload;

    if (outcome.status === "success" && payload.status === "ok") {
      const service =
        typeof payload.service === "string" && payload.service.trim()
          ? payload.service.trim()
          : "the HR system";
      return {
        forceRespond: true,
        message: `Yes, ${service} is up and responding normally.`,
      };
    }

    if (outcome.status === "error") {
      if (outcome.errorMessage?.includes("connection refused")) {
        return {
          forceRespond: true,
          message:
            "I can't reach the Aletia HR Platform right now. Please check that the service is running and try again.",
        };
      }
      if (outcome.errorMessage?.includes("request timed out")) {
        return {
          forceRespond: true,
          message: "The Aletia HR Platform is not responding right now. Please try again in a moment.",
        };
      }
      return {
        forceRespond: true,
        message: "I couldn't confirm the HR system status right now because the Aletia service returned an error.",
      };
    }

    return { forceRespond: true };
  }

  if ((outcome.data.kind === "record" || outcome.data.kind === "list") && shouldForceRespondAfterSuccessfulTool(prompt, outcome)) {
    return { forceRespond: true };
  }

  return { forceRespond: false };
}

function resolveActiveModes(request: ChatRequest): ModeOptions {
  return {
    research: request.context?.modes?.research ?? false,
    thinking: request.context?.modes?.thinking ?? true,
  };
}

async function executeToolWithRetry(
  tool: ToolName,
  toolInput: AgentToolInput,
  correlationId: string,
  user: AuthenticatedUser,
  ipAddress?: string,
): Promise<ToolOutcome> {
  const start = Date.now();
  let attempt = 0;
  const toolRegistry = createToolRegistry(user);

  while (attempt <= RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      const runTool = toolRegistry[tool] as ToolExecutor;
      const result = await withTimeout(runTool(toolInput, { correlationId, user, ipAddress }), TOOL_TIMEOUT_MS);
      const elapsed = Date.now() - start;
      logEvent("info", "agent.tool.success", correlationId, {
        tool,
        tool_version: result.version,
        attempt,
        latency_ms: elapsed,
      });
      const blocked =
        result.data.payload &&
        typeof result.data.payload === "object" &&
        (
          (result.data.payload as Record<string, unknown>).allowed === false ||
          (result.data.payload as Record<string, unknown>).access_denied === true
        );
      return {
        status: blocked ? "blocked" : "success",
        latencyMs: elapsed,
        attempts: attempt,
        tool,
        toolInput,
        data: result.data as ToolResultEnvelope<Record<string, unknown>>,
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
          data: {
            ok: false,
            kind: "record",
            payload: {},
            user_safe_error: formatUserSafeToolError(
              tool,
              error instanceof Error ? error.message : "unknown_error",
            ),
          },
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
    data: {
      ok: false,
      kind: "record",
      payload: {},
      user_safe_error: formatUserSafeToolError(tool, "retry_exhausted"),
    },
    errorMessage: "retry_exhausted",
  };
}

const TOOL_STATUS_MESSAGES: Partial<Record<string, string>> = {
  search_api: "Searching the web...",
  execute_query: "Querying HR data...",
};

const RESPONSE_STATUS_MESSAGE = "Collating response...";

function buildToolStepResult(step: number, result: ToolOutcome): AgentStepResult {
  return {
    step,
    tool: result.tool,
    tool_input: result.toolInput,
    status: result.status,
    data: result.data,
    citation: result.citation,
    error_message: result.errorMessage,
  };
}

async function persistArtifactAction(
  action: { artifact_type: ArtifactType; title: string; summary: string; content: unknown },
  sessionId: string,
  prompt: string,
  correlationId: string,
  meta: Record<string, unknown>,
): Promise<{ message: string; uiActions: AgentUiAction[] }> {
  const artifact = await materializeArtifactFile(action.title, action.artifact_type, action.content);
  const artifactId = makeId("art");
  await createArtifact({
    id: artifactId,
    sessionId,
    title: action.title,
    prompt,
    artifactType: action.artifact_type,
    contentJson: artifact.contentJson,
    htmlPreview: artifact.htmlPreview,
    textContent: artifact.textContent,
    fileName: artifact.fileName,
    filePath: artifact.filePath,
    mimeType: artifact.mimeType,
    metadataJson: { source: "agent_artifact_action", artifact_type: action.artifact_type, ...meta },
  });
  logEvent("info", "agent.artifact.generated", correlationId, {
    artifact_type: action.artifact_type,
    title: action.title,
    artifact_id: artifactId,
    file_name: artifact.fileName,
    ...meta,
  });

  const downloadAction: AgentUiAction = {
    id: `action-artifact-download-${artifactId}`,
    type: "button",
    title: `Download ${action.title}`,
    description: `Download the generated ${action.artifact_type.toUpperCase()} file.`,
    buttonLabel: `Download ${action.artifact_type.toUpperCase()}`,
    href: `/artifacts/${artifactId}/download`,
  };

  if (action.artifact_type !== "pdf") {
    return {
      message: action.summary,
      uiActions: [downloadAction],
    };
  }

  return {
    message: action.summary,
    uiActions: [
      {
        id: `action-artifact-view-${artifactId}`,
        type: "button",
        title: `View ${action.title}`,
        description: "Open the generated document preview in the viewer.",
        buttonLabel: "View Document",
        href: `/viewer/${artifactId}`,
      },
      downloadAction,
    ],
  };
}

export async function runAgent(
  request: ChatRequest,
  correlationId: string,
  user: AuthenticatedUser,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
  onStatus?: (phase: string, message: string) => void,
  ipAddress?: string,
  deps: AgentRuntimeDeps = {},
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const activeModes = resolveActiveModes(request);
  const modeTools = resolveAllowedTools(activeModes);
  const allowedTools = ([...modeTools] as ToolName[])
    .filter((tool, index, list) => list.indexOf(tool) === index)
    .filter((tool) => (tool === "search_api" ? activeModes.research : true));
  const maxToolCalls = env.AGENT_MAX_TOOL_CALLS;
  const maxActionLoops = Math.max(maxToolCalls * 2 + 4, 6);

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
  let shouldForceRespond = false;
  const decideAction = deps.decideAction ?? decideNextAgentAction;
  const executeTool = deps.executeTool ?? executeToolWithRetry;
  const persistArtifact = deps.persistArtifact ?? persistArtifactAction;
  const routedCapabilities = await routeRequest(request.prompt, correlationId, history, activeModes);

  const applyRespondAction = (action: Extract<AgentAction, { type: "respond" }>) => {
    finalMessage = action.message_text;
    finalUiActions = action.ui_actions ?? [];
    finalSummary = action.summary;
    finalFollowUp = action.follow_up;
    finalShowSources = action.show_sources;
  };

  const applyArtifactAction = async (
    action: Extract<AgentAction, { type: "artefact" }>,
    meta: Record<string, unknown>,
    failureEvent: string,
  ) => {
    try {
      const persisted = await persistArtifact(
        action,
        request.session_id,
        request.prompt,
        correlationId,
        meta,
      );
      finalMessage = persisted.message;
      finalUiActions = persisted.uiActions;
    } catch (error) {
      logEvent("warn", failureEvent, correlationId, {
        error_message: error instanceof Error ? error.message : "unknown_error",
      });
      finalMessage = "I could not persist the generated document artifact right now. Please retry.";
    }
  };

  const loadedSkills = new Set<SkillName>();
  const loadSkill = (skillName: SkillName, announce = false) => {
    if (loadedSkills.has(skillName)) {
      return false;
    }
    const skillEntry = skillRegistry[skillName];
    if (!skillEntry) {
      return false;
    }
    loadedSkills.add(skillName);
    if (announce) {
      const skillLabel = skillName.replace(/_/g, " ");
      onStatus?.("skill", `Loading ${skillLabel} skill...`);
    }
    stepResults.push({
      step: stepResults.length + 1,
      tool: `activated_skill:${skillName}`,
      tool_input: skillName,
      status: "success",
      data: { skill: skillName, instructions: skillEntry.instructions },
    });
    return true;
  };

  const getUnlockedTools = (): ToolName[] => {
    const unlockedTools = Array.from(
      loadedSkills,
      (skill) => skillToolAccess[skill] ?? [],
    ).flat();

    return allowedTools.filter((tool, index, list) =>
      unlockedTools.includes(tool) && list.indexOf(tool) === index,
    );
  };

  const getCurrentSystemPrompt = () =>
    buildSystemPrompt(activeModes, allowedTools, Array.from(loadedSkills), user);

  for (const selectedSkill of routedCapabilities.skills) {
    loadSkill(selectedSkill);
  }

  for (let loop = 1; loop <= maxActionLoops; loop += 1) {
    if (Date.now() - startedAt >= TOTAL_REQUEST_BUDGET_MS || finalMessage) {
      break;
    }

    const availableActionTools = getUnlockedTools();
    const systemPrompt = getCurrentSystemPrompt();
    onStatus?.("planning", "Thinking...");

    const nextAction = await decideAction(
      request.prompt,
      correlationId,
      history,
      stepResults,
      systemPrompt,
      availableActionTools,
      activeModes,
      false,
    );

    if (!nextAction) {
      break;
    }

    if (nextAction.type === "call_tool") {
      if (!availableActionTools.includes(nextAction.tool)) {
        stepResults.push({
          step: stepResults.length + 1,
          tool: nextAction.tool,
          tool_input: nextAction.tool_input,
          status: "error",
          data: {
            ok: false,
            kind: "record",
            payload: {},
            user_safe_error: `Tool "${nextAction.tool}" is not currently unlocked.`,
          },
          error_message: `Tool "${nextAction.tool}" is not currently unlocked.`,
        });
        continue;
      }

      if (toolCalls >= maxToolCalls) {
        stepResults.push({
          step: stepResults.length + 1,
          tool: nextAction.tool,
          tool_input: nextAction.tool_input,
          status: "error",
          data: {
            ok: false,
            kind: "record",
            payload: {},
            user_safe_error: `Tool budget reached (${maxToolCalls}).`,
          },
          error_message: `Tool budget reached (${maxToolCalls}).`,
        });
        logEvent("info", "agent.tool.budget_reached", correlationId, {
          tool: nextAction.tool,
          max_tool_calls: maxToolCalls,
        });
        shouldForceRespond = true;
        break;
      }

      const toolCallKey = makeToolCallKey(nextAction.tool, nextAction.tool_input);
      const lastTerminalToolStep = getLastTerminalToolStep(stepResults);
      const repeatsLatestTerminalToolCall =
        Boolean(lastTerminalToolStep) &&
        lastTerminalToolStep?.tool === nextAction.tool &&
        makeToolCallKey(nextAction.tool, lastTerminalToolStep.tool_input) === toolCallKey;
      const repeatedTerminalCall = stepResults.find(
        (step) =>
          step.tool === nextAction.tool &&
          (step.status === "success" || step.status === "blocked" || step.status === "error") &&
          makeToolCallKey(nextAction.tool, step.tool_input) === toolCallKey,
      );

      if (repeatedTerminalCall) {
        stepResults.push({
          step: stepResults.length + 1,
          tool: nextAction.tool,
          tool_input: nextAction.tool_input,
          status: "blocked",
          data: {
            ok: false,
            kind: "record",
            payload: {},
            user_safe_error: "Repeated tool call blocked.",
          },
          error_message: repeatsLatestTerminalToolCall
            ? `Skipped repeated tool call because the latest observation already contains the same ${repeatedTerminalCall.status} result.`
            : `Skipped repeated tool call because the same ${repeatedTerminalCall.status} result is already available.`,
        });
        logEvent("info", "agent.tool.repeat_blocked", correlationId, {
          tool: nextAction.tool,
          prior_status: repeatedTerminalCall.status,
          repeated_latest_observation: repeatsLatestTerminalToolCall,
        });
        shouldForceRespond = true;
        break;
      }

      const toolStatusMessage = TOOL_STATUS_MESSAGES[nextAction.tool] ?? `Running ${nextAction.tool}...`;
      onStatus?.("tool", toolStatusMessage);
      const outcome = await executeTool(nextAction.tool, nextAction.tool_input, correlationId, user, ipAddress);
      const stepResult = buildToolStepResult(stepResults.length + 1, outcome);
      toolCalls += 1;
      toolResults.push(outcome);
      stepResults.push(stepResult);
      const completionDirective = getCompletionDirective(request.prompt, outcome);
      if (completionDirective.message) {
        onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
        finalMessage = completionDirective.message;
        break;
      }
      if (completionDirective.forceRespond) {
        logEvent("info", "agent.response.force_after_sufficient_tool_result", correlationId, {
          tool: outcome.tool,
          result_kind: outcome.data.kind,
          tool_calls_used: toolCalls,
        });
        shouldForceRespond = true;
        break;
      }
      continue;
    }

    if (nextAction.type === "artefact") {
      if (!loadedSkills.has("artefact_design")) {
        loadSkill("artefact_design", true);
        continue;
      }
      onStatus?.("artefact", "Generating document...");
      await applyArtifactAction(nextAction, { phase: "unified_loop" }, "agent.artefact.failed_unified");
      break;
    }

    if (nextAction.type === "respond") {
      onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
      applyRespondAction(nextAction);
      break;
    }
  }

  if (!finalMessage) {
    const systemPrompt = getCurrentSystemPrompt();
    onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
    const forcedResponse = await decideAction(
      request.prompt,
      correlationId,
      history,
      stepResults,
      systemPrompt,
      [],
      activeModes,
      true,
    );

    if (forcedResponse?.type === "respond") {
      applyRespondAction(forcedResponse);
    } else if (forcedResponse?.type === "artefact") {
      await applyArtifactAction(
        forcedResponse,
        { generated_in_forced_step: true },
        "agent.artefact.failed_forced",
      );
    }
  }

  if (!finalMessage) {
    finalMessage =
      getLatestUserSafeError(stepResults) ??
      "I could not complete the request with a valid final response right now. Please retry with a narrower prompt.";
  }

  const citations = stepResults
    .filter(
      (s) =>
        s.tool === "search_api" &&
        s.status === "success" &&
        s.data?.kind === "search" &&
        typeof s.data.payload === "object" &&
        s.data.payload !== null &&
        Array.isArray((s.data.payload as { hits?: unknown }).hits),
    )
    .flatMap((s) => {
      const hits = (s.data.payload as {
        hits: Array<{
        title?: string;
        snippet?: string;
        url?: string;
        source?: string;
        image?: string;
        }>;
      }).hits;
      return hits.map((h) => ({
        label: h.source?.trim() || "Source",
        source: h.title?.trim() || "Untitled",
        uri: h.url?.trim() || undefined,
        image: h.image?.trim() || undefined,
      }));
    });

  const skillTrace = stepResults
    .filter((s) => s.tool.startsWith("activated_skill:"))
    .map((s) => ({
      tool: s.tool,
      status: (s.status === "success" ? "success" : s.status === "blocked" ? "blocked" : "error") as "success" | "blocked" | "error",
      latency_ms: 0,
      attempts: 1,
    }));

  const trace = [
    ...skillTrace,
    ...toolResults.map((result) => ({
      tool: result.tool,
      status: result.status as "success" | "blocked" | "error",
      latency_ms: result.latencyMs,
      attempts: result.attempts,
    })),
  ];

  const hasErrors = toolResults.some((result) => result.status === "error");

  return {
    message_text: finalMessage,
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
            what_i_tried: "I executed model-selected tool steps with timeout/retry controls in a unified loop.",
            next_options: ["Retry now", "Try a narrower prompt"],
          },
        ]
      : [],
  };
}
