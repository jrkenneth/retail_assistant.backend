import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config.js";
import { logEvent } from "../chat/logger.js";
import { getChatModel } from "./llmClient.js";
import { AGENT_SYSTEM_PROMPT } from "./systemPrompt.js";
import { VALID_SKILL_NAMES, skillSummaryLines, type SkillName } from "./skillRegistry.js";
import { toolDescriptions, type ToolName } from "./toolRegistry.js";
import type { AgentAction, AgentPlan, AgentStepResult, AgentUiAction, PlannedStep } from "./types.js";

function parseActionText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const VALID_UI_TYPES = new Set(["table", "chart", "card", "button"]);

function toUiActions(value: unknown): AgentUiAction[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      const id = asString(row.id);
      const type = asString(row.type);
      const title = asString(row.title);
      if (!id || !VALID_UI_TYPES.has(type) || !title) {
        return null;
      }
      const action: AgentUiAction = { id, type: type as AgentUiAction["type"], title };
      if (Array.isArray(row.columns)) action.columns = row.columns.map(String);
      if (Array.isArray(row.rows)) action.rows = row.rows as Array<Record<string, string>>;
      if (typeof row.chartType === "string") action.chartType = row.chartType as "bar" | "line" | "pie";
      if (Array.isArray(row.series)) action.series = row.series as AgentUiAction["series"];
      if (typeof row.description === "string") action.description = row.description;
      if (typeof row.buttonLabel === "string") action.buttonLabel = row.buttonLabel;
      if (typeof row.href === "string") action.href = row.href;
      return action;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return actions.length > 0 ? actions : undefined;
}

function toAction(parsed: Record<string, unknown> | null, availableTools: ToolName[]): AgentAction | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const intent = asString(parsed.intent) || "llm_selected_action";
  const action = parsed.action;
  if (!action || typeof action !== "object") {
    return null;
  }

  const actionRow = action as Record<string, unknown>;
  const actionType = asString(actionRow.type);
  // Treat "ui_actions" as an alias for "respond" — the LLM sometimes uses it
  // when it intends a final response with visual components.
  if (actionType === "respond" || actionType === "ui_actions") {
    const messageText = asString(actionRow.message_text);
    if (!messageText) {
      return null;
    }
    return {
      type: "respond",
      intent,
      message_text: messageText,
      ui_actions: toUiActions(actionRow.ui_actions),
      summary: typeof actionRow.summary === "string" && actionRow.summary.trim()
        ? actionRow.summary.trim()
        : undefined,
      follow_up: typeof actionRow.follow_up === "string" && actionRow.follow_up.trim()
        ? actionRow.follow_up.trim()
        : undefined,
      show_sources: typeof actionRow.show_sources === "boolean" ? actionRow.show_sources : undefined,
    };
  }

  if (actionType === "artefact") {
    const documentType = asString(actionRow.document_type);
    const title = asString(actionRow.title);
    const summary = asString(actionRow.summary);
    const html = asString(actionRow.html);
    if (!documentType || !title || !summary || !html) {
      return null;
    }

    return {
      type: "artefact",
      intent,
      document_type: documentType,
      title,
      summary,
      html,
    };
  }

  if (actionType === "call_tool") {
    const tool = asString(actionRow.tool);
    const toolInput = asString(actionRow.tool_input);
    const allowedSet = new Set(availableTools);
    if (!toolInput || !allowedSet.has(tool as ToolName)) {
      return null;
    }

    return {
      type: "call_tool",
      intent,
      tool: tool as ToolName,
      tool_input: toolInput,
      rationale: asString(actionRow.rationale) || undefined,
    };
  }

  if (actionType === "call_skill") {
    const skill = asString(actionRow.skill);
    if (!VALID_SKILL_NAMES.has(skill)) {
      return null;
    }
    return {
      type: "call_skill",
      intent,
      skill: skill as SkillName,
    };
  }

  return null;
}

// ─── Plan builder ────────────────────────────────────────────────────────────

function parsePlan(raw: string, availableTools: ToolName[]): AgentPlan | null {
  const parsed = parseActionText(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : "";
  if (!intent) return null;
  if (!Array.isArray(parsed.steps)) return null;

  const allowedToolSet = new Set(availableTools);
  const steps: PlannedStep[] = [];

  for (const item of parsed.steps) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const stepNum = typeof s.step === "number" ? s.step : steps.length + 1;
    const type = typeof s.type === "string" ? s.type.trim() : "";

    if (type === "call_skill") {
      const skill = typeof s.skill === "string" ? s.skill.trim() : "";
      if (!VALID_SKILL_NAMES.has(skill)) continue;
      steps.push({ step: stepNum, type: "call_skill", skill: skill as SkillName });
    } else if (type === "call_tool") {
      const tool = typeof s.tool === "string" ? s.tool.trim() : "";
      const toolInput = typeof s.tool_input === "string" ? s.tool_input.trim() : "";
      if (!toolInput || !allowedToolSet.has(tool as ToolName)) continue;
      steps.push({ step: stepNum, type: "call_tool", tool: tool as ToolName, tool_input: toolInput });
    } else if (type === "respond") {
      steps.push({ step: stepNum, type: "respond" });
    } else if (type === "artefact") {
      steps.push({ step: stepNum, type: "artefact" });
    }
  }

  if (steps.length === 0) return null;

  // Ensure the plan ends with a terminal step.
  const last = steps[steps.length - 1];
  if (last.type !== "respond" && last.type !== "artefact") {
    steps.push({ step: steps.length + 1, type: "respond" });
  }

  return { intent, steps };
}

export async function buildAgentPlan(
  prompt: string,
  correlationId: string,
  history: Array<{ role: "user" | "assistant"; text: string }>,
  availableTools: ToolName[],
  systemPrompt: string = AGENT_SYSTEM_PROMPT,
): Promise<AgentPlan | null> {
  const model = getChatModel();
  if (!model) return null;

  const filteredDescriptions = Object.fromEntries(
    Object.entries(toolDescriptions).filter(([name]) => availableTools.includes(name as ToolName)),
  );
  const toolsList = Object.entries(filteredDescriptions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");

  const planningSystemPrompt = [
    "You are a planning agent. Analyse the user request and return a single JSON object describing the minimal execution plan.",
    "Return ONLY valid JSON — no prose, no markdown fences.",
    'Schema: {"intent":"<one sentence summary>","steps":[...]}',
    "Step shapes:",
    '  call_skill : {"step":N,"type":"call_skill","skill":"<skill_name>"}',
    '  call_tool  : {"step":N,"type":"call_tool","tool":"<tool_name>","tool_input":"<concrete query>"}',
    '  respond    : {"step":N,"type":"respond"}',
    '  artefact   : {"step":N,"type":"artefact"}',
    "Planning rules:",
    "- Greetings, thank-you, conversational replies, questions you can answer from knowledge → steps=[{step:1,type:respond}]",
    "- Research tasks → load the relevant skill first, then one call_tool per distinct search angle (max 4), then respond.",
    "- Presentations / reports / structured documents → load artefact_design skill, optional searches, then artefact.",
    "- Do NOT add redundant skill loads. Each skill should appear at most once.",
    "- Every plan must end with a respond or artefact step.",
    "- tool_input must be a specific, concrete search query — never a placeholder or template.",
    `Available skills:\n${skillSummaryLines || "(none)"}`,
    `Available tools:\n${toolsList || "(none)"}`,
  ].join("\n");

  const recentHistory =
    history.length > 0
      ? `Recent conversation:\n${history
          .slice(-4)
          .map((t) => `${t.role}: ${t.text}`)
          .join("\n")}`
      : "";

  const planningUserPrompt = [recentHistory, `User request: ${prompt}`]
    .filter(Boolean)
    .join("\n");

  try {
    const message = await model.invoke([
      new SystemMessage(planningSystemPrompt),
      new HumanMessage(planningUserPrompt),
    ]);

    const rawText =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .map((item) =>
                typeof item === "string" ? item : "text" in item ? String(item.text) : "",
              )
              .join("")
          : "";

    const plan = parsePlan(rawText, availableTools);
    if (plan) {
      logEvent("info", "agent.plan.built", correlationId, {
        model: env.LLM_MODEL,
        intent: plan.intent,
        steps: plan.steps.map((s) => ({ step: s.step, type: s.type })),
      });
    } else {
      logEvent("warn", "agent.plan.parse_failed", correlationId, { model: env.LLM_MODEL });
    }
    return plan;
  } catch (error) {
    logEvent("warn", "agent.plan.error", correlationId, {
      model: env.LLM_MODEL,
      error_message: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

// ─── Step decider (reactive fallback) ─────────────────────────────────────────

export async function decideNextAgentAction(
  prompt: string,
  correlationId: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
  steps: AgentStepResult[] = [],
  systemPrompt: string = AGENT_SYSTEM_PROMPT,
  availableTools: ToolName[] = Object.keys(toolDescriptions) as ToolName[],
  forceRespond = false,
): Promise<AgentAction | null> {
  const model = getChatModel();
  if (!model) {
    return null;
  }

  const filteredDescriptions = Object.fromEntries(
    Object.entries(toolDescriptions).filter(([name]) =>
      availableTools.includes(name as ToolName),
    ),
  );

  const toolsList = Object.entries(filteredDescriptions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");

  // Slim step summary — never forward full tool data payloads.
  // For search_api steps, hits are shown as numbered citation references so the
  // model can place accurate [cite:N] markers. Running index tracks global offset.
  let citationOffset = 0;
  const stepSummary =
    steps.length > 0
      ? steps
          .map((step) => {
            const entry: Record<string, unknown> = {
              step: step.step,
              tool: step.tool,
              status: step.status,
            };
            if (step.error_message) {
              entry.error = step.error_message;
            } else if (step.tool.startsWith("call_skill:")) {
              // Forward the full skill instructions so they shape the synthesis call.
              entry.skill_instructions =
                typeof step.data?.instructions === "string"
                  ? step.data.instructions
                  : "skill loaded";
            } else if (step.tool === "search_api" && Array.isArray(step.data?.hits)) {
              // Format hits as indexed citation references so the model can embed
              // accurate [cite:N] markers. Global offset carries across steps.
              const hits = step.data.hits as Array<{
                title?: string;
                snippet?: string;
                url?: string;
                source?: string;
              }>;
              entry.citations = hits.map((h, i) => ({
                index: citationOffset + i,
                marker: `[cite:${citationOffset + i}]`,
                title: h.title ?? "Untitled",
                source: h.source ?? "unknown",
                url: h.url ?? null,
                snippet: (h.snippet ?? "").slice(0, 180),
              }));
              citationOffset += hits.length;
            } else {
              const raw = JSON.stringify(step.data);
              entry.result_excerpt = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
              if (step.citation) entry.citation = step.citation.source;
            }
            return JSON.stringify(entry);
          })
          .join("\n")
      : "none";

  // Planning prompt is purely contextual — all rules live in the system prompt.
  const planningPrompt = [
    "You are executing one step in an iterative agent loop.",
    "Your system prompt contains all rules, action schemas, skill guidelines, and formatting constraints — follow them exactly.",
    "Return a single JSON action and nothing else.",
    forceRespond
      ? "IMPORTANT: You must produce a final output now. Use action.type='respond' for plain answers, or action.type='artefact' for document deliverables. Do not call any further tools or skills."
      : availableTools.length > 0
        ? "Tools and skills are available. Use call_skill first for specialist tasks, then call_tool if needed, then respond."
        : "No tools are available. Respond directly from knowledge.",
    `Available skills:\n${skillSummaryLines || "(none)"}`,
    `Available tools:\n${toolsList || "(none)"}`,
    `Steps executed so far (${steps.length}):\n${stepSummary}`,
    history.length > 0
      ? `Recent conversation:\n${history
          .slice(-6)
          .map((turn) => `${turn.role}: ${turn.text}`)
          .join("\n")}`
      : "Recent conversation: none",
    `User request: ${prompt}`,
  ].join("\n");

  // Collect skill instructions loaded during execution and inject them into the
  // SystemMessage so they actively shape the synthesis call instead of sitting
  // inert in a slim step-summary field.
  const loadedSkillInstructions = steps
    .filter((s) => s.tool.startsWith("call_skill:") && s.status === "success")
    .map((s) => {
      const name = s.tool.replace("call_skill:", "").replace(/_/g, " ");
      const body = typeof s.data?.instructions === "string" ? s.data.instructions : "";
      return body ? `## Loaded skill: ${name}\n${body}` : null;
    })
    .filter((s): s is string => Boolean(s));

  const augmentedSystemPrompt =
    loadedSkillInstructions.length > 0
      ? `${systemPrompt}\n\n---\nACTIVE SKILL INSTRUCTIONS — apply these when producing your response:\n\n${loadedSkillInstructions.join("\n\n")}`
      : systemPrompt;

  for (let iteration = 1; iteration <= env.AGENT_MAX_PLANNING_ITERATIONS; iteration += 1) {
    try {
      const message = await model.invoke([
        new SystemMessage(augmentedSystemPrompt),
        new HumanMessage(planningPrompt),
      ]);

      const rawText =
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.content)
            ? message.content
                .map((item) =>
                  typeof item === "string" ? item : "text" in item ? String(item.text) : "",
                )
                .join("")
            : "";

      const parsed = parseActionText(rawText);
      const action = toAction(parsed, availableTools);

      if (action) {
        logEvent("info", "agent.action.llm_success", correlationId, {
          iteration,
          model: env.LLM_MODEL,
          intent: action.intent,
          action_type: action.type,
          tool: action.type === "call_tool" ? action.tool : undefined,
        });
        return action;
      }

      logEvent("warn", "agent.action.llm_parse_failed", correlationId, {
        iteration,
        model: env.LLM_MODEL,
      });
    } catch (error) {
      logEvent("warn", "agent.action.llm_error", correlationId, {
        iteration,
        model: env.LLM_MODEL,
        error_message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return null;
}
