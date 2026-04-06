import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config.js";
import { logEvent } from "../chat/logger.js";
import { extractMessageText, getChatModel } from "./llmClient.js";
import { AGENT_SYSTEM_PROMPT } from "./systemPrompt.js";
import type { ModeOptions } from "./systemPrompt.js";
import { artifactTypeSchema, type ArtifactType } from "../artifacts/types.js";
import {
  type ChatResponse,
  escalationPayloadSchema,
  loyaltyPayloadSchema,
  orderCardPayloadSchema,
  policyCitationSchema,
  productCardPayloadSchema,
  quickActionSchema,
  refusalPayloadSchema,
} from "../chat/contracts.js";
import {
  SPECIALIST_SKILL_NAMES,
  specialistSkillSummaryLines,
  type SpecialistSkillName,
} from "./skillRegistry.js";
import { toolDescriptions, type ToolName } from "./toolRegistry.js";
import type {
  AgentAction,
  AgentToolInput,
  AgentStepResult,
  AgentUiAction,
} from "./types.js";

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolCallInput(tool: ToolName, toolInput: unknown): AgentToolInput {
  if (tool === "search_api") {
    return asString(toolInput);
  }

  if (tool === "query_policy") {
    if (!isPlainObject(toolInput)) {
      return { query: "", top_k: 3 };
    }

    return {
      query: asString(toolInput.query),
      ...(typeof toolInput.top_k === "number" ? { top_k: toolInput.top_k } : {}),
    };
  }

  if (!isPlainObject(toolInput)) {
    return {};
  }

  return {
    domain: asString(toolInput.domain),
    intent: asString(toolInput.intent),
    params: isPlainObject(toolInput.params) ? toolInput.params : {},
    filters: isPlainObject(toolInput.filters) ? toolInput.filters : {},
  };
}

function validateToolCallInput(tool: ToolName, toolInput: unknown): boolean {
  const normalizedToolInput = normalizeToolCallInput(tool, toolInput);
  if (tool === "search_api") {
    return typeof normalizedToolInput === "string" && Boolean(normalizedToolInput.trim());
  }

  if (tool === "query_policy" && isPlainObject(normalizedToolInput)) {
    return Boolean(asString(normalizedToolInput.query));
  }

  if (tool === "execute_query" && isPlainObject(normalizedToolInput)) {
    return Boolean(asString(normalizedToolInput.domain) && asString(normalizedToolInput.intent));
  }

  return false;
}

function validateSkillCallInput(skill: unknown): skill is SpecialistSkillName {
  return typeof skill === "string" && SPECIALIST_SKILL_NAMES.includes(skill as SpecialistSkillName);
}

const VALID_UI_TYPES = new Set(["table", "chart", "card", "button"]);
const MAX_SUMMARY_ROWS = 50;

function isPrimitiveSummaryValue(value: unknown): value is string | number | boolean | null {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function summarizeStepData(
  step: AgentStepResult,
  citationOffset: number,
): { entry: Record<string, unknown>; nextCitationOffset: number } {
  const entry: Record<string, unknown> = {
    step: step.step,
    tool: step.tool,
    status: step.status,
  };

  if (step.error_message) {
    entry.error = step.error_message;
    return { entry, nextCitationOffset: citationOffset };
  }

  if (step.tool.startsWith("activated_skill:")) {
    entry.skill =
      typeof step.data?.skill === "string"
        ? step.data.skill
        : step.tool.replace("activated_skill:", "");
    entry.loaded = true;
    return { entry, nextCitationOffset: citationOffset };
  }

  const toolEnvelope =
    isPlainObject(step.data) &&
    typeof step.data.ok === "boolean" &&
    typeof step.data.kind === "string" &&
    "payload" in step.data
      ? step.data
      : null;

  if (toolEnvelope) {
    entry.ok = toolEnvelope.ok;
    entry.result_kind = toolEnvelope.kind;
    if (typeof toolEnvelope.summary === "string" && toolEnvelope.summary.trim()) {
      entry.summary = toolEnvelope.summary.trim();
    }
  }

  const payload = toolEnvelope && isPlainObject(toolEnvelope.payload) ? toolEnvelope.payload : step.data;

  if (step.tool === "search_api" && Array.isArray((payload as Record<string, unknown> | undefined)?.hits)) {
    const hits = (payload as { hits: Array<{
      title?: string;
      snippet?: string;
      url?: string;
      source?: string;
    }> }).hits;
    entry.citations = hits.map((h, i) => ({
      index: citationOffset + i,
      marker: `[cite:${citationOffset + i}]`,
      title: h.title ?? "Untitled",
      source: h.source ?? "unknown",
      url: h.url ?? null,
      snippet: (h.snippet ?? "").slice(0, 180),
    }));
    return { entry, nextCitationOffset: citationOffset + hits.length };
  }

  if (Array.isArray((payload as Record<string, unknown> | undefined)?.rows)) {
    const rows = (payload as { rows: Array<Record<string, unknown>> }).rows;
    entry.row_count = rows.length;
    entry.rows = rows.slice(0, MAX_SUMMARY_ROWS);

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (key === "rows") continue;
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"))
      ) {
        entry[key] = value;
      }
    }

    if (step.citation) entry.citation = step.citation.source;
    return { entry, nextCitationOffset: citationOffset };
  }

  if (isPlainObject(payload)) {
    let preservedStructuredField = false;

    for (const [key, value] of Object.entries(payload)) {
      if (isPrimitiveSummaryValue(value)) {
        entry[key] = value;
        continue;
      }

      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        entry[key] = value;
        continue;
      }

      if (Array.isArray(value) && value.every((item) => isPlainObject(item))) {
        entry[`${key}_count`] = value.length;
        entry[key] = value.slice(0, MAX_SUMMARY_ROWS);
        preservedStructuredField = true;
        continue;
      }

      if (isPlainObject(value)) {
        entry[key] = value;
        preservedStructuredField = true;
      }
    }

    if (preservedStructuredField || Object.keys(entry).length > 3) {
      if (step.citation) entry.citation = step.citation.source;
      return { entry, nextCitationOffset: citationOffset };
    }
  }

  const raw = JSON.stringify(payload);
  entry.result_excerpt = raw.length > 400 ? `${raw.slice(0, 400)}...` : raw;
  if (step.citation) entry.citation = step.citation.source;
  return { entry, nextCitationOffset: citationOffset };
}

function formatStepObservations(steps: AgentStepResult[]): string {
  if (steps.length === 0) {
    return "No prior observations.";
  }

  let citationOffset = 0;
  const observations = steps.map((step, index) => {
    const summary = summarizeStepData(step, citationOffset);
    citationOffset = summary.nextCitationOffset;
    const label = index === steps.length - 1 ? "CURRENT OBSERVATION" : `OBSERVATION ${index + 1}`;
    return `${label}\n${JSON.stringify(summary.entry, null, 2)}`;
  });

  return observations.join("\n\n");
}

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

  if (actionType === "respond" || actionType === "ui_actions") {
    const messageText = asString(actionRow.message_text);
    if (!messageText) {
      return null;
    }
    const responseType = asString(actionRow.response_type) as AgentAction["type"] extends never
      ? never
      : "text" | "product_card" | "order_card" | "escalation" | "refusal" | "loyalty_card";
    const validResponseTypes = new Set([
      "text",
      "product_card",
      "order_card",
      "escalation",
      "refusal",
      "loyalty_card",
    ]);
    const normalizedResponseType = validResponseTypes.has(responseType) ? responseType : "text";

    let parsedPayload: ChatResponse["payload"];
    if (actionRow.payload && isPlainObject(actionRow.payload)) {
      const payloadCandidate = actionRow.payload;
      const schema =
        normalizedResponseType === "product_card"
          ? productCardPayloadSchema
          : normalizedResponseType === "order_card"
            ? orderCardPayloadSchema
            : normalizedResponseType === "escalation"
              ? escalationPayloadSchema
              : normalizedResponseType === "refusal"
                ? refusalPayloadSchema
                : normalizedResponseType === "loyalty_card"
                  ? loyaltyPayloadSchema
                  : null;

      if (schema) {
        const parsedSchema = schema.safeParse(payloadCandidate);
        if (parsedSchema.success) {
          parsedPayload = parsedSchema.data;
        }
      }
    }

    const policyCitations = Array.isArray(actionRow.policy_citations)
      ? actionRow.policy_citations
          .map((item) => policyCitationSchema.safeParse(item))
          .filter((item) => item.success)
          .map((item) => item.data)
      : undefined;

    const quickActions = Array.isArray(actionRow.quick_actions)
      ? actionRow.quick_actions
          .map((item) => quickActionSchema.safeParse(item))
          .filter((item) => item.success)
          .map((item) => item.data)
      : undefined;

    return {
      type: "respond",
      intent,
      response_type: normalizedResponseType,
      message_text: messageText,
      payload: parsedPayload,
      confidence_score:
        typeof actionRow.confidence_score === "number" ? actionRow.confidence_score : undefined,
      policy_citations: policyCitations,
      quick_actions: quickActions,
      ui_actions: toUiActions(actionRow.ui_actions),
      summary:
        typeof actionRow.summary === "string" && actionRow.summary.trim()
          ? actionRow.summary.trim()
          : undefined,
      follow_up:
        typeof actionRow.follow_up === "string" && actionRow.follow_up.trim()
          ? actionRow.follow_up.trim()
          : undefined,
      show_sources: typeof actionRow.show_sources === "boolean" ? actionRow.show_sources : undefined,
    };
  }

  if (actionType === "artefact") {
    const artifactType = asString(actionRow.artifact_type || actionRow.document_type);
    const title = asString(actionRow.title);
    const summary = asString(actionRow.summary);
    let content: unknown = actionRow.content;

    if ((artifactType === "pdf" || artifactType === "txt") && typeof content === "string") {
      content = artifactType === "pdf" ? { html: content } : { text: content };
    }
    if (!content && typeof actionRow.html === "string") {
      content = { html: actionRow.html };
    }

    if (!artifactType || !title || !summary || content === undefined) {
      return null;
    }

    const parsedArtifactType = artifactTypeSchema.safeParse(artifactType);
    if (!parsedArtifactType.success) {
      return null;
    }

    return {
      type: "artefact",
      intent,
      artifact_type: parsedArtifactType.data as ArtifactType,
      title,
      summary,
      content,
    };
  }

  if (actionType === "call_tool") {
    const tool = asString(actionRow.tool);
    const toolInput = actionRow.tool_input;
    const allowedSet = new Set(availableTools);
    if (!allowedSet.has(tool as ToolName) || !validateToolCallInput(tool as ToolName, toolInput)) {
      return null;
    }

    return {
      type: "call_tool",
      intent,
      tool: tool as ToolName,
      tool_input: normalizeToolCallInput(tool as ToolName, toolInput),
      rationale: asString(actionRow.rationale) || undefined,
    };
  }

  if (actionType === "call_skill") {
    const skill = asString(actionRow.skill);
    if (!validateSkillCallInput(skill)) {
      return null;
    }

    return {
      type: "call_skill",
      intent,
      skill,
      rationale: asString(actionRow.rationale) || undefined,
    };
  }

  return null;
}

export async function decideNextAgentAction(
  prompt: string,
  correlationId: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
  steps: AgentStepResult[] = [],
  systemPrompt: string = AGENT_SYSTEM_PROMPT,
  availableTools: ToolName[] = Object.keys(toolDescriptions) as ToolName[],
  modes: ModeOptions = { research: false, thinking: true },
  forceRespond = false,
): Promise<AgentAction | null> {
  const model = getChatModel({ thinking: modes.thinking });
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

  const stepSummary = formatStepObservations(steps);

  const planningPrompt = [
    "You are executing one step in an iterative agent loop.",
    "Your system prompt contains all rules, action schemas, skill guidelines, and formatting constraints — follow them exactly.",
    "Return a single JSON action and nothing else.",
    forceRespond
      ? "IMPORTANT: You must produce a final output now. Use action.type='respond' for plain answers, or action.type='artefact' for document deliverables. Do not call any further tools or skills. If specialist guidance is already loaded, apply it."
      : availableTools.length > 0
        ? "Use already-loaded specialist guidance when present. The platform usually preselects the needed capabilities before this loop begins. Use call_tool only when needed, then respond once the request is satisfied."
        : "No tools are available. Respond directly from knowledge.",
    "PRIOR OBSERVATIONS are authoritative. Read them carefully before choosing the next action.",
    "If the CURRENT OBSERVATION fully answers the user request, your next action must be respond.",
    "Do not repeat a tool call when the current observation already contains the answer or when an equivalent result is already available from the same tool.",
    `Available specialist skills:\n${specialistSkillSummaryLines || "(none)"}`,
    `Available tools:\n${toolsList || "(none)"}`,
    `Prior observations (${steps.length}):\n${stepSummary}`,
    history.length > 0
      ? `Recent conversation:\n${history
          .slice(-6)
          .map((turn) => `${turn.role}: ${turn.text}`)
          .join("\n")}`
      : "Recent conversation: none",
    `User request: ${prompt}`,
  ].join("\n");

  for (let iteration = 1; iteration <= env.AGENT_MAX_PLANNING_ITERATIONS; iteration += 1) {
    try {
      const message = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(planningPrompt),
      ]);

      const rawText = extractMessageText(message.content);
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
