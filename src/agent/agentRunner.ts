import type { ArtifactType } from "../artifacts/types.js";
import { materializeArtifactFile } from "../artifacts/generators.js";
import type { AuthenticatedUser } from "../auth/types.js";
import { escalationPayloadSchema, refusalPayloadSchema, type ChatRequest, type ChatResponse } from "../chat/contracts.js";
import { env } from "../config.js";
import { logEvent } from "../chat/logger.js";
import { logAuditEvent } from "../audit/auditLogger.js";
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
import {
  CORE_SKILL_NAMES,
  skillRegistry,
  type SkillName,
  type SpecialistSkillName,
  SPECIALIST_SKILL_NAMES,
} from "./skillRegistry.js";
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

type RefusalReasonCode =
  | "low_confidence"
  | "policy_restriction"
  | "live_check_unavailable"
  | "missing_identifier";

type AgentResponseType = "text" | "product_card" | "order_card" | "escalation" | "refusal" | "loyalty_card";

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
      return "I can't reach the Velora platform right now. Please check that the service is running and try again.";
    }
    if (errorMessage.includes("request timed out")) {
      return "The Velora platform is not responding right now. Please try again in a moment.";
    }
    if (errorMessage.includes("authentication failed")) {
      return "I couldn't access the Velora platform because the connection credentials appear to be invalid.";
    }
    if (errorMessage.includes("bad request") || errorMessage.includes("invalid filter")) {
      return "I couldn't complete that Velora lookup because the request details were invalid.";
    }
    if (errorMessage.includes("requires param")) {
      return `I couldn't complete that lookup because a required identifier was missing. ${errorMessage} Make sure to extract it from a prior search result before calling this intent.`;
    }
    return "I couldn't complete that lookup because the Velora service returned an error.";
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

  const complexSignals =
    /\b(compare|comparison|versus|vs|benchmark|market|current trends|latest|recent|online|web|search|research|report|brief|deck|presentation|combine|merge|summari[sz]e and|and then|along with)\b/.test(
      normalized,
    );
  if (complexSignals) {
    return false;
  }

  // Count how many distinct retail domains are referenced.
  // Multi-domain prompts (e.g. "find headphones and check my return") are complex.
  const domainHits = [
    /\b(product|products|spec|specs|warranty|availability|stock)\b/.test(normalized),
    /\b(order|orders|tracking|track|shipment|delivery|delivered|package)\b/.test(normalized),
    /\b(return|returns|refund|exchange)\b/.test(normalized),
    /\b(loyalty|points|reward|rewards)\b/.test(normalized),
    /\b(policy|policies|terms)\b/.test(normalized),
    /\b(ticket|support)\b/.test(normalized),
  ].filter(Boolean).length;

  if (domainHits > 1) {
    return false;
  }

  const hasLookupIntent =
    /\b(show|list|find|get|give me|who is|who are|what is|tell me|display|check|track|view|see|look up|my)\b/.test(
      normalized,
    ) && domainHits >= 1;

  return hasLookupIntent;
}

function shouldForceRespondAfterSuccessfulTool(prompt: string, result: ToolOutcome): boolean {
  if (result.status !== "success") {
    return false;
  }

  const executeQueryInput = getStructuredToolInput(result.tool, result.toolInput);
  const executeQueryIntent = executeQueryInput ? asText(executeQueryInput.intent) : undefined;

  // search_products is often a discovery step before get_product_detail.
  // Do not short-circuit here; allow another planning step for richer specs.
  if (result.tool === "execute_query" && executeQueryIntent === "search_products") {
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
          : "the Velora service";
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
            "I can't reach the Velora platform right now. Please check that the service is running and try again.",
        };
      }
      if (outcome.errorMessage?.includes("request timed out")) {
        return {
          forceRespond: true,
          message: "The Velora platform is not responding right now. Please try again in a moment.",
        };
      }
      return {
        forceRespond: true,
        message: "I couldn't confirm the system status right now because the Velora service returned an error.",
      };
    }

    return { forceRespond: true };
  }

  if ((outcome.data.kind === "record" || outcome.data.kind === "list") && shouldForceRespondAfterSuccessfulTool(prompt, outcome)) {
    return { forceRespond: true };
  }

  return { forceRespond: false };
}

function requiresLiveCommerceConfirmation(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasIdentifier = /\b(ord-\d{4,}|ret-\d{3,})\b/.test(normalized);
  const hasCustomerSpecificCommerceContext =
    /\b(my|this|that)\s+(order|return|refund|delivery|tracking)\b/.test(normalized) ||
    /\b(where is my order|order status|order detail|delivery status|refund status|return status|cancel order|track(ing)? (my )?order)\b/.test(normalized);

  // Generic policy questions should be answered from policy evidence, not blocked for
  // missing order/return identifiers.
  return hasIdentifier || hasCustomerSpecificCommerceContext;
}

function requiresLoyaltyHistoryConfirmation(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const loyaltyMentioned = /\b(loyalty|points?)\b/.test(normalized);
  const activityRequested = /\b(recent|history|activity|transactions?)\b/.test(normalized);
  return loyaltyMentioned && activityRequested;
}

function requiresPolicyEvidence(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(policy|return window|refund policy|warranty policy|shipping policy|privacy policy|terms|eligible products|eligibility|exchange policy|loyalty programme|loyalty program|points? expire|expiration|inactivity)\b/.test(normalized);
}

function requiresWebSearchEvidence(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(compare|comparison|versus|vs|benchmark|market|latest|recent|online|web|search)\b/.test(normalized);
}

function isExplicitEscalationRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(escalat(e|ion)|human|specialist|support agent|live agent|manager|handoff|hand-off)\b/.test(normalized);
}

function buildEscalationConsentQuickActions(): NonNullable<ChatResponse["quick_actions"]> {
  return [
    {
      label: "Yes, escalate to support",
      prompt: "Yes, please escalate this to a human specialist.",
    },
    {
      label: "No, continue in chat",
      prompt: "No, continue helping me here in chat.",
    },
  ];
}

function isInformationalPolicyQuestion(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const asksPolicyInfo =
    requiresPolicyEvidence(prompt) ||
    /\b(does|what|which|is|are|can|could|would|tell me|explain|clarify|cover|coverage|included|excluded)\b/.test(normalized);

  const actionOrCaseSpecificSignals =
    /\b(ord-\d{4,}|ret-\d{3,}|ticket-\d{4,}|tkt-\d{4,})\b/.test(normalized) ||
    /\b(my|this|that)\s+(order|return|refund|delivery|tracking)\b/.test(normalized) ||
    /\b(initiate|process|approve|cancel|reopen|start|escalate|refund me|return my)\b/.test(normalized);

  return asksPolicyInfo && !actionOrCaseSpecificSignals;
}

function extractOrderNumberFromText(text: string): string | undefined {
  const match = text.match(/\bORD-\d{4,}\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

function extractSkuFromText(text: string): string | undefined {
  const candidates = text.toUpperCase().match(/\b[A-Z0-9]{2,}(?:-[A-Z0-9]{2,}){1,4}\b/g) ?? [];
  const blockedPrefixes = ["ORD-", "RET-", "TKT-", "TICKET-", "CUST-", "AR-"];
  return candidates.find((token) => !blockedPrefixes.some((prefix) => token.startsWith(prefix)));
}

function extractReturnNumberFromText(text: string): string | undefined {
  const match = text.match(/\bRET-\d{3,}\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

function extractTicketNumberFromText(text: string): string | undefined {
  const match = text.match(/\b(?:TKT|TICKET)-\d{4,}\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

function extractEstimatedWaitMinutesFromText(text: string): number | undefined {
  const match = text.match(/estimated wait(?: time)?(?: is|:)?\s*(\d+)\s*minutes?/i);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function extractQueuePositionFromText(text: string): number | undefined {
  const direct = text.match(/queue(?: position)?(?: is|:)?\s*(\d+)/i);
  if (direct) {
    const value = Number(direct[1]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
  }

  const narrative = text.match(/number\s*(\d+)\s*in the queue/i);
  if (!narrative) {
    return undefined;
  }
  const value = Number(narrative[1]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function looksLikeEscalationNarrative(message: string): boolean {
  const normalized = message.toLowerCase();
  return /\b(escalat|specialist|support team|ticket number|queue|estimated wait)\b/.test(normalized);
}

function isEscalationCancellationRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return (
    /\bcancel\b.*\b(escalation|ticket)\b/.test(normalized)
    || /\bstop\b.*\b(escalation|ticket)\b/.test(normalized)
    || /\bwithdraw\b.*\b(escalation|ticket)\b/.test(normalized)
  );
}

function resolveActiveModes(request: ChatRequest): ModeOptions {
  return {
    research: request.context?.modes?.research ?? false,
    thinking: request.context?.modes?.thinking ?? false,
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
  query_policy: "Checking Velora policies...",
  execute_query: "Checking Velora data...",
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

function requiresGroundedConfidence(prompt: string, responseType: AgentResponseType): boolean {
  if (responseType === "escalation" || responseType === "refusal") {
    return false;
  }

  if (responseType === "product_card" || responseType === "order_card" || responseType === "loyalty_card") {
    return true;
  }

  const normalized = prompt.toLowerCase();
  const productDataRequest =
    /\b(price|cost|availability|stock|spec|specs|product detail|sku)\b/.test(normalized) ||
    Boolean(extractSkuFromText(prompt));
  const customerDataRequest =
    /\b(account status|customer number|loyalty balance|loyalty points|points balance|order history)\b/.test(normalized)
    || requiresLiveCommerceConfirmation(prompt);

  return productDataRequest || customerDataRequest;
}

function hasLoyaltyEvidence(payload: ChatResponse["payload"], user: AuthenticatedUser): boolean {
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  return (
    asFiniteNumber(row.current_balance) !== undefined
    || asFiniteNumber(row.loyalty_points) !== undefined
    || typeof user.loyalty_points === "number"
  );
}

function getConfidenceScore(
  toolResults: ToolOutcome[],
  context: {
    prompt: string;
    responseType: AgentResponseType;
    payload: ChatResponse["payload"];
    user: AuthenticatedUser;
  },
): number {
  // Deterministic data from the platform always takes priority.
  // A low policy similarity score should not override a confirmed data result.
  const hasDeterministicToolData = toolResults.some(
    (result) => result.status === "success" && result.tool === "execute_query",
  );
  if (hasDeterministicToolData) {
    return 0.95;
  }

  const hasDeterministicAccessDecision = toolResults.some((result) => {
    if (result.tool !== "execute_query" || result.status !== "blocked") {
      return false;
    }
    const payload = result.data?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return false;
    }

    return (payload as Record<string, unknown>).access_denied === true;
  });

  // Access-denied decisions returned by execute_query are deterministic policy outcomes.
  if (hasDeterministicAccessDecision) {
    return 0.9;
  }

  if (context.responseType === "loyalty_card" && hasLoyaltyEvidence(context.payload, context.user)) {
    // Authenticated loyalty balance is deterministic customer context.
    return 0.9;
  }

  const lastSuccessfulPolicyResult = [...toolResults]
    .reverse()
    .find((result) => result.status === "success" && result.tool === "query_policy");

  if (lastSuccessfulPolicyResult) {
    const policyPayload = lastSuccessfulPolicyResult.data.payload as Record<string, unknown> | undefined;
    const chunksCount = Array.isArray(policyPayload?.chunks) ? policyPayload.chunks.length : 0;
    // If no chunks were returned (embeddings not yet seeded or query matched nothing),
    // return a neutral passing score so the response is not blocked by the
    // low-confidence gate — the LLM will correctly state it cannot confirm the policy.
    if (chunksCount === 0) {
      return 0.65;
    }
    const score = Number(policyPayload?.max_similarity ?? 0);
    const clamped = Math.max(0, Math.min(1, score));
    return Math.max(0.65, clamped);
  }

  const hasToolErrors = toolResults.some((result) => result.status === "error");
  const needsGrounding = requiresGroundedConfidence(context.prompt, context.responseType);

  if (needsGrounding && hasToolErrors) {
    return 0.3;
  }

  if (!needsGrounding) {
    // Non-factual conversational responses should not be treated as low-confidence failures.
    return 0.8;
  }

  return 0.4;
}

function applyConfidencePolicy(
  message: string,
  confidenceScore: number,
  responseType: AgentResponseType,
  enforceLowConfidenceGate: boolean,
): {
  message: string;
  responseType?: AgentResponseType;
  followUp?: string;
  summary?: string;
  refusalReasonCode?: RefusalReasonCode;
} {
  if (!enforceLowConfidenceGate) {
    return { message };
  }

  if (responseType === "escalation" || responseType === "refusal") {
    return { message };
  }

  if (confidenceScore < 0.5) {
    return {
      message:
        message.trim().length > 0
          ? message
          : "I’m not confident enough to answer that based on verified Velora information. I can help escalate this to a human specialist if you’d like.",
      responseType: "refusal",
      followUp: "If you want, I can help you continue with a support escalation.",
      summary: "Low-confidence response prevented; escalation offered.",
      refusalReasonCode: "low_confidence",
    };
  }

  if (confidenceScore < 0.75 && responseType === "text") {
    const suffix = " I recommend verifying this with our support team.";
    return {
      message: message.endsWith(suffix) ? message : `${message}${suffix}`,
    };
  }

  return { message };
}

function getRefusalCopy(reasonCode: RefusalReasonCode): {
  reason: string;
  summary: string;
  policyTitle: string;
} {
  switch (reasonCode) {
    case "low_confidence":
      return {
        reason:
          "I’m not confident enough to answer that based on verified Velora information. I can help escalate this to a human specialist if you’d like.",
        summary: "Low-confidence response prevented; escalation offered.",
        policyTitle: "Verification Requirement",
      };
    case "live_check_unavailable":
      return {
        reason:
          "I couldn't complete the required live Velora confirmation right now, so I can't provide a definitive answer yet.",
        summary: "Required live verification was unavailable.",
        policyTitle: "Live Confirmation Requirement",
      };
    case "missing_identifier":
      return {
        reason:
          "I need your order number or return number to run a live Velora confirmation before I can advise next steps.",
        summary: "Required order or return identifier was missing.",
        policyTitle: "Live Confirmation Requirement",
      };
    case "policy_restriction":
    default:
      return {
        reason: "This request is restricted by verified Velora policy and order data.",
        summary: "Verified policy restriction applied.",
        policyTitle: "Policy Restriction",
      };
  }
}

function inferRefusalReasonCode(
  payload: ChatResponse["payload"],
  message: string,
  summary?: string,
): RefusalReasonCode {
  const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const explicitReasonCode = asText(payloadRow.reason_code)?.toLowerCase();
  if (
    explicitReasonCode === "low_confidence" ||
    explicitReasonCode === "policy_restriction" ||
    explicitReasonCode === "live_check_unavailable" ||
    explicitReasonCode === "missing_identifier"
  ) {
    return explicitReasonCode;
  }

  const reasonText = `${message} ${summary ?? ""}`.toLowerCase();
  if (/not confident enough|low-confidence/.test(reasonText)) {
    return "low_confidence";
  }
  if (/live velora|live confirmation|service is running|not responding/.test(reasonText)) {
    return "live_check_unavailable";
  }
  if (/need your order number|need your return number|required identifier/.test(reasonText)) {
    return "missing_identifier";
  }

  return "policy_restriction";
}

function getEffectiveConfidenceScore(
  baseConfidence: number,
  currentConfidence: number | undefined,
  responseType: AgentResponseType,
  refusalReasonCode?: RefusalReasonCode,
  enforceGroundedConfidenceCap = false,
): number {
  const fallback = currentConfidence ?? baseConfidence;
  if (responseType === "refusal" && refusalReasonCode === "low_confidence") {
    return Math.min(fallback, 0.49);
  }

  if (enforceGroundedConfidenceCap) {
    return Math.min(fallback, baseConfidence);
  }

  return fallback;
}

type ProductCardPayloadShape = {
  sku: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  availability_status: string;
  is_promotion_eligible: boolean;
  warranty_duration: string;
  return_window_days: number;
  specifications: Record<string, string>;
  image_url?: string;
  rating?: number;
  review_count?: number;
};

type OrderCardPayloadShape = {
  order_number: string;
  order_date: string;
  status: string;
  delivery_status: string;
  tracking_number?: string;
  estimated_delivery_date?: string;
  refund_status?: string;
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  can_initiate_return: boolean;
};

type OrderHistoryEntry = {
  order_number: string;
  order_date: string;
  status: string;
  delivery_status: string;
  estimated_delivery_date?: string;
  total_amount?: number;
};

type LoyaltyPayloadShape = {
  current_balance: number;
  tier?: string;
  recent_transactions: Array<{ date: string; description: string; points: number; type: string }>;
};

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function asDateOnly(value: unknown): string | undefined {
  const text = asText(value);
  if (!text) {
    return undefined;
  }
  const datePart = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return datePart ? datePart[1] : text;
}

function normalizeSpecs(specs: unknown): Record<string, string> {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(specs as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (trimmed) {
        output[key] = trimmed;
      }
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      output[key] = String(rawValue);
    }
  }

  return output;
}

function normalizeProductRecord(source: Record<string, unknown>): ProductCardPayloadShape | undefined {
  const sku = asText(source.sku);
  const name = asText(source.name);
  const price = asFiniteNumber(source.price);
  const availabilityStatus = asText(source.availability_status);
  const warrantyDuration = asText(source.warranty_duration);
  const returnWindowDays = asFiniteNumber(source.return_window_days);

  if (
    !sku ||
    !name ||
    price === undefined ||
    !availabilityStatus ||
    !warrantyDuration ||
    returnWindowDays === undefined
  ) {
    return undefined;
  }

  return {
    sku,
    name,
    description: asText(source.description),
    price,
    original_price: asFiniteNumber(source.original_price),
    availability_status: availabilityStatus,
    is_promotion_eligible: asBoolean(source.is_promotion_eligible) ?? false,
    warranty_duration: warrantyDuration,
    return_window_days: Math.max(0, Math.round(returnWindowDays)),
    specifications: normalizeSpecs(source.specifications),
    image_url: asText(source.image_url),
    rating: asFiniteNumber(source.rating),
    review_count: asFiniteNumber(source.review_count),
  };
}

function extractNormalizedProducts(toolResults: ToolOutcome[]): ProductCardPayloadShape[] {
  const deduped = new Map<string, ProductCardPayloadShape>();
  for (const row of extractProductRecords(toolResults)) {
    const normalized = normalizeProductRecord(row);
    if (!normalized) {
      continue;
    }
    if (!deduped.has(normalized.sku)) {
      deduped.set(normalized.sku, normalized);
    }
  }
  return Array.from(deduped.values());
}

function shouldUseMultiProductTable(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const promotionOrDiscoverySignals =
    /\b(promotion|promotions|deal|deals|offer|offers|discount|sale|catalog|list|options|recommend|suggest|compare|similar|alternatives|top|best|available products?)\b/.test(
      normalized,
    );
  const specificProductSignals =
    /\bsku\b|\bdetails?\s+for\b|\bproduct\s+detail\b|\bexact\s+product\b/.test(normalized);
  return promotionOrDiscoverySignals && !specificProductSignals;
}

function buildMultiProductTableActions(products: ProductCardPayloadShape[]): AgentUiAction[] {
  if (products.length === 0) {
    return [];
  }

  const rows = products.slice(0, 8).map((product) => ({
    Name: product.name,
    SKU: product.sku,
    Price: `$${product.price.toFixed(2)}`,
    Promo: product.is_promotion_eligible ? "Yes" : "No",
    Availability: product.availability_status.replace(/_/g, " "),
    Warranty: product.warranty_duration,
    Returns: `${product.return_window_days} days`,
  }));

  const tableAction: AgentUiAction = {
    id: makeId("products-table"),
    type: "table",
    title: "Product Comparison",
    columns: ["Name", "SKU", "Price", "Promo", "Availability", "Warranty", "Returns"],
    rows,
  };

  const ctaActions: AgentUiAction[] = products.slice(0, 3).map((product) => ({
    id: makeId("product-cta"),
    type: "button",
    title: `View ${product.name}`,
    description: `Open product page for SKU ${product.sku}.`,
    buttonLabel: "View Product",
    href: `catalog/${encodeURIComponent(product.sku)}`,
  }));

  return [tableAction, ...ctaActions];
}

function buildMultiProductQuickActions(
  products: ProductCardPayloadShape[],
): NonNullable<ChatResponse["quick_actions"]> {
  return products.slice(0, 3).map((product) => ({
    label: `View ${product.sku}`,
    prompt: `Show full details for SKU ${product.sku}.`,
  }));
}

function extractProductRecords(toolResults: ToolOutcome[]): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];

  for (const result of toolResults) {
    if (result.tool !== "execute_query" || result.status !== "success") {
      continue;
    }
    const payload = result.data.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = item as Record<string, unknown>;
          if (asText(row.sku) || asText(row.name)) {
            records.push(row);
          }
        }
      }
      continue;
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const row = data as Record<string, unknown>;
      if (asText(row.sku) || asText(row.name)) {
        records.push(row);
      }
    }
  }

  return records;
}

function extractExecuteQueryRecords(toolResults: ToolOutcome[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  for (const result of toolResults) {
    if (result.tool !== "execute_query" || result.status !== "success") {
      continue;
    }
    const payload = result.data.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          rows.push(item as Record<string, unknown>);
        }
      }
      continue;
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      rows.push(data as Record<string, unknown>);
    }
  }

  return rows;
}

function extractLoyaltyTransactionRows(toolResults: ToolOutcome[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  for (const result of toolResults) {
    if (result.tool !== "execute_query" || result.status !== "success") {
      continue;
    }

    const payload = result.data.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const root = payload as Record<string, unknown>;
    const data = root.data;

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = item as Record<string, unknown>;
          if (
            asFiniteNumber(row.points) !== undefined ||
            asText(row.transaction_type) ||
            asText(row.description) ||
            asDateOnly(row.date) ||
            asDateOnly(row.created_at)
          ) {
            rows.push(row);
          }
        }
      }
      continue;
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;

      if (Array.isArray(record.transactions)) {
        for (const tx of record.transactions) {
          if (tx && typeof tx === "object" && !Array.isArray(tx)) {
            rows.push(tx as Record<string, unknown>);
          }
        }
      }

      if (
        asFiniteNumber(record.points) !== undefined ||
        asText(record.transaction_type) ||
        asText(record.description) ||
        asDateOnly(record.date) ||
        asDateOnly(record.created_at)
      ) {
        rows.push(record);
      }
    }
  }

  return rows;
}

function normalizeProductPayload(
  payload: ChatResponse["payload"],
  toolResults: ToolOutcome[],
): ProductCardPayloadShape | undefined {
  const current = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const records = extractProductRecords(toolResults);
  const currentSku = asText(current.sku);
  const currentName = asText(current.name)?.toLowerCase();

  const matchedRecord =
    (currentSku
      ? records.find((row) => asText(row.sku)?.toLowerCase() === currentSku.toLowerCase())
      : undefined) ??
    (currentName
      ? records.find((row) => asText(row.name)?.toLowerCase() === currentName)
      : undefined) ??
    records[0];

  const source = matchedRecord ?? {};
  return normalizeProductRecord(source);
}

function buildProductNarrative(payload: ProductCardPayloadShape, prompt: string): string {
  const requestedBattery = /battery|battery life/i.test(prompt);
  const requestedWarranty = /warranty/i.test(prompt);
  const requestedPrice = /price|cost|how much/i.test(prompt);

  const specs = payload.specifications ?? {};
  const batterySpec = specs["Battery Life"] ?? specs.Battery ?? specs["Battery life"];
  const priceText = `$${payload.price.toFixed(2)}`;

  const bits: string[] = [];
  if (payload.description) {
    bits.push(payload.description);
  }
  bits.push(`${payload.name} (${payload.sku}) is currently priced at ${priceText}.`);

  if (requestedBattery || batterySpec) {
    bits.push(
      batterySpec
        ? `Battery life is listed as ${batterySpec}.`
        : "Battery life is not available in the current Velora inventory record.",
    );
  }

  if (requestedWarranty || payload.warranty_duration) {
    bits.push(`It includes a ${payload.warranty_duration} manufacturer warranty.`);
  }

  if (!requestedPrice) {
    bits.push(`Return window: ${payload.return_window_days} days.`);
  }

  return bits.join(" ");
}

function normalizeOrderPayload(
  payload: ChatResponse["payload"],
  toolResults: ToolOutcome[],
): OrderCardPayloadShape | undefined {
  const current = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const records = extractExecuteQueryRecords(toolResults).filter((row) => asText(row.order_number));
  const orderNumberHint = asText(current.order_number);
  const source =
    (orderNumberHint
      ? records.find((row) => asText(row.order_number) === orderNumberHint)
      : undefined) ??
    records[0] ??
    {};

  const order_number = asText(source.order_number);
  const status = asText(source.status);
  const delivery_status = asText(source.delivery_status);
  // track_order responses only contain tracking fields (no order_date or created_at).
  // Fall back through all available date fields so the card still renders.
  const order_date =
    asDateOnly(source.order_date) ??
    asDateOnly(source.created_at) ??
    asDateOnly(source.estimated_delivery_date) ??
    asDateOnly((current as Record<string, unknown>).order_date) ??
    "N/A";
  if (!order_number || !status || !delivery_status) {
    return undefined;
  }

  const itemRows = extractExecuteQueryRecords(toolResults)
    .filter((row) => asText(row.name) && asFiniteNumber(row.quantity) !== undefined && asFiniteNumber(row.unit_price) !== undefined)
    .map((row) => ({
      name: asText(row.name)!,
      quantity: Math.max(1, Math.round(asFiniteNumber(row.quantity)!)),
      unit_price: asFiniteNumber(row.unit_price)!,
    }));

  const sourceItems = Array.isArray(source.items)
    ? source.items
        .filter((row) => row && typeof row === "object" && !Array.isArray(row))
        .map((row) => row as Record<string, unknown>)
        .filter((row) => asText(row.name) && asFiniteNumber(row.quantity) !== undefined && asFiniteNumber(row.unit_price) !== undefined)
        .map((row) => ({
          name: asText(row.name)!,
          quantity: Math.max(1, Math.round(asFiniteNumber(row.quantity)!)),
          unit_price: asFiniteNumber(row.unit_price)!,
        }))
    : [];

  const items = sourceItems.length > 0 ? sourceItems : itemRows;
  const toolCanInitiateReturn = asBoolean(source.can_initiate_return);
  const payloadCanInitiateReturn = asBoolean(current.can_initiate_return);

  return {
    order_number,
    order_date,
    status,
    delivery_status,
    tracking_number: asText(source.tracking_number),
    estimated_delivery_date: asDateOnly(source.estimated_delivery_date),
    refund_status: asText(source.refund_status),
    items,
    // Prefer deterministic tool output; if absent, retain the planner payload hint
    // instead of forcing an incorrect false-negative for return eligibility.
    can_initiate_return: toolCanInitiateReturn ?? payloadCanInitiateReturn ?? false,
  };
}

function getExecuteQueryIntents(toolResults: ToolOutcome[]): Set<string> {
  const intents = new Set<string>();

  for (const result of toolResults) {
    if (result.tool !== "execute_query") {
      continue;
    }
    const input = getStructuredToolInput(result.tool, result.toolInput);
    const intent = input ? asText(input.intent) : undefined;
    if (intent) {
      intents.add(intent);
    }
  }

  return intents;
}

function extractOrderHistoryEntries(toolResults: ToolOutcome[]): OrderHistoryEntry[] {
  const rows = extractExecuteQueryRecords(toolResults);
  const byOrder = new Map<string, OrderHistoryEntry>();

  for (const row of rows) {
    const orderNumber = asText(row.order_number);
    if (!orderNumber) {
      continue;
    }

    if (!byOrder.has(orderNumber)) {
      byOrder.set(orderNumber, {
        order_number: orderNumber,
        order_date: asDateOnly(row.order_date) ?? asDateOnly(row.created_at) ?? "unknown",
        status: asText(row.status) ?? "unknown",
        delivery_status: asText(row.delivery_status) ?? "unknown",
        estimated_delivery_date: asDateOnly(row.estimated_delivery_date),
        total_amount: asFiniteNumber(row.total_amount),
      });
    }
  }

  return Array.from(byOrder.values());
}

function buildOrderHistoryNarrative(entries: OrderHistoryEntry[]): string {
  const heading = `Here are your ${entries.length} most recent order${entries.length === 1 ? "" : "s"}:`;
  const lines = entries.slice(0, 5).map((entry) => {
    const amountPart = entry.total_amount !== undefined ? `, total $${entry.total_amount.toFixed(2)}` : "";
    const etaPart = entry.estimated_delivery_date ? `, expected ${entry.estimated_delivery_date}` : "";
    return `- ${entry.order_number}: placed ${entry.order_date}, status ${entry.status.toLowerCase()}, delivery ${entry.delivery_status.toLowerCase()}${amountPart}${etaPart}.`;
  });

  return [heading, ...lines].join("\n");
}

function buildOrderHistoryQuickActions(entries: OrderHistoryEntry[]): NonNullable<ChatResponse["quick_actions"]> {
  return entries.slice(0, 3).map((entry) => ({
    label: `Track ${entry.order_number}`,
    prompt: `Show tracking details for order ${entry.order_number}.`,
  }));
}

function buildOrderNarrative(payload: OrderCardPayloadShape): string {
  const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  const parts: string[] = [
    `Order ${payload.order_number} is currently ${payload.status.toLowerCase()} with delivery status ${payload.delivery_status.toLowerCase()}.`,
    `Order date: ${payload.order_date}.`,
    itemCount > 0
      ? `The order includes ${itemCount} item${itemCount === 1 ? "" : "s"}.`
      : "Line-item details were not returned in the current order response.",
  ];

  if (payload.tracking_number) {
    parts.push(`Tracking number: ${payload.tracking_number}.`);
  }
  if (payload.estimated_delivery_date) {
    parts.push(`Estimated delivery: ${payload.estimated_delivery_date}.`);
  }
  if (payload.refund_status) {
    parts.push(`Refund status: ${payload.refund_status}.`);
  }
  parts.push(payload.can_initiate_return ? "This order is currently eligible for return initiation." : "Return initiation is not currently available for this order.");

  return parts.join(" ");
}

function normalizeLoyaltyPayload(
  payload: ChatResponse["payload"],
  toolResults: ToolOutcome[],
  user?: AuthenticatedUser,
): LoyaltyPayloadShape | undefined {
  const current = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const records = extractExecuteQueryRecords(toolResults);
  const loyaltyRows = extractLoyaltyTransactionRows(toolResults);
  const balanceRecord = records.find((row) => asFiniteNumber(row.loyalty_points) !== undefined || asFiniteNumber(row.current_balance) !== undefined);

  const current_balance =
    (balanceRecord
      ? asFiniteNumber(balanceRecord.loyalty_points) ?? asFiniteNumber(balanceRecord.current_balance)
      : undefined)
    ?? asFiniteNumber(current.current_balance)
    ?? (typeof user?.loyalty_points === "number" ? user.loyalty_points : undefined);
  if (current_balance === undefined) {
    return undefined;
  }

  const txRowsFromRecords = loyaltyRows
    .filter(
      (row) =>
        (asDateOnly(row.date) ?? asDateOnly(row.created_at) ?? asDateOnly(row.transaction_date)) &&
        asText(row.description) &&
        asFiniteNumber(row.points) !== undefined,
    )
    .map((row) => ({
      date: (asDateOnly(row.date) ?? asDateOnly(row.created_at) ?? asDateOnly(row.transaction_date))!,
      description: asText(row.description)!,
      points: Math.round(asFiniteNumber(row.points)!),
      type: asText(row.transaction_type) ?? asText(row.type) ?? "activity",
    }));

  const txRowsFromPayload = Array.isArray(current.recent_transactions)
    ? current.recent_transactions
        .filter((row) => row && typeof row === "object" && !Array.isArray(row))
        .map((row) => row as Record<string, unknown>)
        .filter((row) => asDateOnly(row.date) && asText(row.description) && asFiniteNumber(row.points) !== undefined)
        .map((row) => ({
          date: asDateOnly(row.date)!,
          description: asText(row.description)!,
          points: Math.round(asFiniteNumber(row.points)!),
          type: asText(row.transaction_type) ?? asText(row.type) ?? "activity",
        }))
    : [];

  const txRows = txRowsFromRecords.length > 0 ? txRowsFromRecords : txRowsFromPayload;

  return {
    current_balance: Math.round(current_balance),
    tier: (balanceRecord ? asText(balanceRecord.tier) : undefined) ?? asText(current.tier),
    recent_transactions: txRows,
  };
}

function buildLoyaltyNarrative(payload: LoyaltyPayloadShape): string {
  const parts: string[] = [`Your current loyalty balance is ${payload.current_balance} points.`];
  if (payload.tier) {
    parts.push(`Current tier: ${payload.tier}.`);
  }
  if (payload.recent_transactions.length > 0) {
    const latest = payload.recent_transactions[0];
    parts.push(`Most recent activity on ${latest.date}: ${latest.description} (${latest.points > 0 ? "+" : ""}${latest.points} points).`);
  } else {
    parts.push("No recent loyalty transactions were returned in the current response.");
  }
  return parts.join(" ");
}

function buildProductQuickActions(payload: ProductCardPayloadShape): NonNullable<ChatResponse["quick_actions"]> {
  return [
    {
      label: "Request detailed specs",
      prompt: `Share the full technical specifications for ${payload.name} (SKU ${payload.sku}), including battery life, connectivity, dimensions, and compatibility.`,
    },
    {
      label: "Compare with similar",
      prompt: `Compare ${payload.name} (SKU ${payload.sku}) with similar products and highlight key feature and price differences.`,
    },
    {
      label: "Check delivery options",
      prompt: `What are the delivery options and estimated shipping time for ${payload.name} (SKU ${payload.sku})?`,
    },
  ];
}

function normalizeQuickActions(
  actions: ChatResponse["quick_actions"],
): NonNullable<ChatResponse["quick_actions"]> {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((action) => {
      const label = asText(action?.label);
      const prompt = asText(action?.prompt);
      if (!label || !prompt) {
        return null;
      }
      const skuOnlyToken = extractSkuFromText(prompt);
      const isSkuOnlyPrompt =
        Boolean(skuOnlyToken) && prompt.toUpperCase().trim() === skuOnlyToken;
      const normalizedPrompt = isSkuOnlyPrompt
        ? `Show full details for SKU ${skuOnlyToken}.`
        : prompt;
      return { label, prompt: normalizedPrompt };
    })
    .filter((action): action is { label: string; prompt: string } => Boolean(action));
}

function getQuickActionKind(action: { label: string; prompt: string }): "detailed_specs" | "compare" | "delivery" | "other" {
  const text = `${action.label} ${action.prompt}`.toLowerCase();
  if (/spec|technical/.test(text)) {
    return "detailed_specs";
  }
  if (/compare|similar|comparable/.test(text)) {
    return "compare";
  }
  if (/deliver|shipping|ship|stock|availability/.test(text)) {
    return "delivery";
  }
  return "other";
}

function mergeProductQuickActions(
  payload: ProductCardPayloadShape,
  llmActions: ChatResponse["quick_actions"],
): NonNullable<ChatResponse["quick_actions"]> {
  const defaults = buildProductQuickActions(payload);
  const normalizedLlmActions = normalizeQuickActions(llmActions);

  if (normalizedLlmActions.length === 0) {
    return defaults;
  }

  const merged = [...normalizedLlmActions];
  const existingKinds = new Set(merged.map((action) => getQuickActionKind(action)));

  for (const fallbackAction of defaults) {
    const kind = getQuickActionKind(fallbackAction);
    if (!existingKinds.has(kind)) {
      merged.push(fallbackAction);
      existingKinds.add(kind);
    }
  }

  return merged;
}

function buildOrderQuickActions(payload: OrderCardPayloadShape): NonNullable<ChatResponse["quick_actions"]> {
  return [
    {
      label: "View Tracking Details",
      prompt: `Show the latest tracking timeline and carrier updates for order ${payload.order_number}.`,
    },
    {
      label: "Contact Support",
      prompt: `I need help from support with order ${payload.order_number}.`,
    },
  ];
}

function getOrderQuickActionKind(action: { label: string; prompt: string }): "tracking" | "support" | "other" {
  const text = `${action.label} ${action.prompt}`.toLowerCase();
  if (/tracking|carrier|timeline|shipment|in transit|delivery/.test(text)) {
    return "tracking";
  }
  if (/support|help|agent|specialist|escalat/.test(text)) {
    return "support";
  }
  return "other";
}

function mergeOrderQuickActions(
  payload: OrderCardPayloadShape,
  llmActions: ChatResponse["quick_actions"],
): NonNullable<ChatResponse["quick_actions"]> {
  const defaults = buildOrderQuickActions(payload);
  const normalizedLlmActions = normalizeQuickActions(llmActions);

  if (normalizedLlmActions.length === 0) {
    return defaults;
  }

  const merged = [...normalizedLlmActions];
  const existingKinds = new Set(merged.map((action) => getOrderQuickActionKind(action)));

  for (const fallbackAction of defaults) {
    const kind = getOrderQuickActionKind(fallbackAction);
    if (!existingKinds.has(kind)) {
      merged.push(fallbackAction);
      existingKinds.add(kind);
    }
  }

  return merged;
}

function deriveProductFollowUpFromQuickActions(
  actions: ChatResponse["quick_actions"],
): string | undefined {
  const normalized = normalizeQuickActions(actions);
  if (normalized.length === 0) {
    return undefined;
  }

  const compareQuestion = normalized.find((action) => {
    const text = `${action.label} ${action.prompt}`.toLowerCase();
    return /compare|similar|comparable/.test(text) && action.prompt.trim().endsWith("?");
  });
  if (compareQuestion) {
    return compareQuestion.prompt;
  }

  const anyQuestion = normalized.find((action) => action.prompt.trim().endsWith("?"));
  return anyQuestion?.prompt;
}

function shouldIncludeSummary(
  responseType: "text" | "product_card" | "order_card" | "escalation" | "refusal" | "loyalty_card",
  message: string,
  summary: string | undefined,
): boolean {
  if (!summary || !summary.trim()) {
    return false;
  }

  // Card/refusal/escalation variants are already concise, purpose-built UIs.
  if (responseType !== "text") {
    return false;
  }

  const normalizedMessage = message.trim();
  const wordCount = normalizedMessage ? normalizedMessage.split(/\s+/).length : 0;
  const charCount = normalizedMessage.length;

  // Only surface "In short" for large text answers.
  return wordCount >= 90 || charCount >= 600;
}

function buildFallbackRefusalPayload(
  payload: ChatResponse["payload"],
  message: string,
  summary?: string,
  reasonCode: RefusalReasonCode = "policy_restriction",
): NonNullable<ChatResponse["payload"]> {
  const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const maybeOrderNumber = asText(payloadRow.order_number);
  const maybeDeliveredDate = asDateOnly(payloadRow.actual_delivery_date) ?? asDateOnly(payloadRow.order_date);
  const maybeItems = Array.isArray(payloadRow.items) ? payloadRow.items : [];
  const maybeFirstItem = maybeItems.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
  const maybeProductName = maybeFirstItem ? asText(maybeFirstItem.name) : undefined;

  const refusalCopy = getRefusalCopy(reasonCode);

  return {
    reason_code: reasonCode,
    reason: message || refusalCopy.reason,
    policy_title: refusalCopy.policyTitle,
    policy_bullets: [
      summary ?? refusalCopy.summary,
    ],
    ...(maybeOrderNumber && maybeProductName && maybeDeliveredDate
      ? {
          order_context: {
            order_number: maybeOrderNumber,
            product_name: maybeProductName,
            delivered_date: maybeDeliveredDate,
          },
        }
      : {}),
  };
}

function buildRefusalQuickActions(
  payload: ChatResponse["payload"],
): NonNullable<ChatResponse["quick_actions"]> {
  const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const orderContext = payloadRow.order_context && typeof payloadRow.order_context === "object" && !Array.isArray(payloadRow.order_context)
    ? (payloadRow.order_context as Record<string, unknown>)
    : undefined;
  const orderNumber = orderContext ? asText(orderContext.order_number) : undefined;
  const maybeReasonCode = asText(payloadRow.reason_code)?.toLowerCase();
  const reasonCode: RefusalReasonCode =
    maybeReasonCode === "low_confidence" ||
    maybeReasonCode === "policy_restriction" ||
    maybeReasonCode === "live_check_unavailable" ||
    maybeReasonCode === "missing_identifier"
      ? maybeReasonCode
      : "policy_restriction";

  if (reasonCode === "missing_identifier") {
    return [
      {
        label: "Share order number",
        prompt: "My order number is ORD-",
      },
      {
        label: "Share return number",
        prompt: "My return number is RET-",
      },
      {
        label: "Escalate to support",
        prompt: "Please escalate this to a human specialist for manual review.",
      },
    ];
  }

  if (reasonCode === "live_check_unavailable") {
    return [
      {
        label: "Try live check again",
        prompt: "Please retry the live Velora check now.",
      },
      {
        label: "Escalate to support",
        prompt: "Please escalate this to a human specialist for manual review.",
      },
      {
        label: "Review policy basis",
        prompt: "Show me the exact policy points used for this decision.",
      },
    ];
  }

  if (reasonCode === "low_confidence") {
    return [
      {
        label: "Provide more details",
        prompt: "I will share additional details so you can verify this more confidently.",
      },
      {
        label: "Try again",
        prompt: "Please re-check this request using verified Velora data.",
      },
      {
        label: "Escalate to support",
        prompt: "Please escalate this to a human specialist for manual review.",
      },
    ];
  }

  return [
    orderNumber
      ? {
          label: "Re-check this order",
          prompt: `Please re-check eligibility and current status for order ${orderNumber} using live Velora data.`,
        }
      : {
          label: "Share order number",
          prompt: "My order number is ORD-",
        },
    {
      label: "Review policy basis",
      prompt: "Show me the exact policy points used for this decision.",
    },
    {
      label: "Escalate to support",
      prompt: "Please escalate this to a human specialist for manual review.",
    },
  ];
}

function buildFallbackEscalationPayload(
  payload: ChatResponse["payload"],
  message: string,
  contextText: string,
): NonNullable<ChatResponse["payload"]> {
  const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const ticketNumber =
    asText(payloadRow.ticket_number)
    ?? extractTicketNumberFromText(contextText)
    ?? "TKT-PENDING";

  const estimatedWait =
    asFiniteNumber(payloadRow.estimated_wait_minutes)
    ?? extractEstimatedWaitMinutesFromText(contextText)
    ?? 15;

  const queuePosition =
    asFiniteNumber(payloadRow.queue_position)
    ?? extractQueuePositionFromText(contextText)
    ?? 3;

  const actionsCompleted = Array.isArray(payloadRow.actions_completed)
    ? payloadRow.actions_completed
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({
          label: asText(item.label) ?? "Escalation created",
          detail: asText(item.detail) ?? "A specialist will review your case.",
        }))
    : [{
      label: "Escalation created",
      detail: "A specialist will review your case.",
    }];

  return {
    ticket_number: ticketNumber,
    estimated_wait_minutes: Math.max(0, Math.round(estimatedWait)),
    queue_position: Math.max(0, Math.round(queuePosition)),
    case_summary: message,
    actions_completed: actionsCompleted,
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
  let finalResponseType: AgentResponseType = "text";
  let finalPayload: ChatResponse["payload"];
  let finalPolicyCitations: ChatResponse["policy_citations"];
  let finalQuickActions: ChatResponse["quick_actions"];
  let finalConfidenceScore: number | undefined;
  let finalUiActions: AgentUiAction[] = [];
  let finalSummary: string | undefined;
  let finalFollowUp: string | undefined;
  let finalShowSources: boolean | undefined;
  let finalRefusalReasonCode: RefusalReasonCode | undefined;
  let toolCalls = 0;
  let shouldForceRespond = false;
  const decideAction = deps.decideAction ?? decideNextAgentAction;
  const executeTool = deps.executeTool ?? executeToolWithRetry;
  const persistArtifact = deps.persistArtifact ?? persistArtifactAction;
  const routedCapabilities = await routeRequest(request.prompt, correlationId, history, activeModes);

  if (isEscalationCancellationRequest(request.prompt)) {
    const contextText = [request.prompt, ...history.map((item) => item.text)].join("\n");
    const ticketNumber = extractTicketNumberFromText(contextText);
    const message = ticketNumber
      ? `Understood. I have cancelled escalation ${ticketNumber}. If you want, I can reopen it anytime.`
      : "Understood. I have cancelled your escalation. If you want, I can reopen it anytime.";

    return {
      response_type: "text",
      message,
      message_text: message,
      payload: undefined,
      policy_citations: undefined,
      quick_actions: [
        {
          label: "Reopen escalation",
          prompt: ticketNumber
            ? `Please reopen escalation ${ticketNumber}.`
            : "Please reopen my escalation.",
        },
      ],
      ui_actions: [],
      citations: [],
      tool_trace: [],
      confidence_score: 0.9,
      summary: undefined,
      follow_up: "I can continue helping here in chat without escalation if you prefer.",
      show_sources: false,
      errors: [],
    };
  }

  const applyRespondAction = (action: Extract<AgentAction, { type: "respond" }>) => {
    finalMessage = action.message_text;
    finalResponseType = action.response_type;
    finalPayload = action.payload;
    finalPolicyCitations = action.policy_citations;
    finalQuickActions = action.quick_actions;
    finalConfidenceScore = action.confidence_score;
    finalUiActions = action.ui_actions ?? [];
    finalSummary = action.summary;
    finalFollowUp = action.follow_up;
    finalShowSources = action.show_sources;
    if (action.response_type === "refusal") {
      finalRefusalReasonCode = inferRefusalReasonCode(action.payload, action.message_text, action.summary);
    }
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
    const unlockedTools = Array.from(loadedSkills)
      .flatMap((skill) =>
        skill in skillToolAccess ? skillToolAccess[skill as SpecialistSkillName] ?? [] : [],
      );
    const baselineTools = activeModes.research && allowedTools.includes("search_api")
      ? ["search_api" as ToolName]
      : [];
    const allUnlocked = [...baselineTools, ...unlockedTools];

    return allowedTools.filter((tool, index, list) =>
      allUnlocked.includes(tool) && list.indexOf(tool) === index,
    );
  };

  const getCurrentSystemPrompt = () =>
    buildSystemPrompt(
      activeModes,
      allowedTools,
      Array.from(loadedSkills).filter(
        (skill): skill is SpecialistSkillName =>
          SPECIALIST_SKILL_NAMES.includes(skill as SpecialistSkillName),
      ),
      user,
      {
        currentDateIso: new Date().toISOString().slice(0, 10),
        customerTimezone: request.context?.timezone,
      },
    );

  for (const coreSkill of CORE_SKILL_NAMES) {
    loadSkill(coreSkill);
  }

  for (const selectedSkill of routedCapabilities.skills) {
    loadSkill(selectedSkill);
  }

  // Ensure policy questions are grounded in retrieved policy text even when
  // the router does not explicitly add policy_rag_skill.
  if (requiresPolicyEvidence(request.prompt)) {
    loadSkill("policy_rag_skill");
  }

  for (let loop = 1; loop <= maxActionLoops; loop += 1) {
    if (Date.now() - startedAt >= TOTAL_REQUEST_BUDGET_MS || finalMessage) {
      break;
    }

    const availableActionTools = getUnlockedTools();

    if (
      requiresPolicyEvidence(request.prompt) &&
      loadedSkills.has("policy_rag_skill") &&
      toolCalls < maxToolCalls &&
      !toolResults.some((r) => r.tool === "query_policy" && r.status === "success")
    ) {
      onStatus?.("tool", "Checking Velora policies...");
      const policyQuery = request.prompt.slice(0, 300);
      const policyOutcome = await executeTool(
        "query_policy",
        { query: policyQuery, top_k: 3 },
        correlationId,
        user,
        ipAddress,
      );
      toolCalls += 1;
      toolResults.push(policyOutcome);
      stepResults.push(buildToolStepResult(stepResults.length + 1, policyOutcome));
      logEvent("info", "agent.rag.enforced_preplanning", correlationId, {
        tool: "query_policy",
        status: policyOutcome.status,
      });
      continue;
    }

    const systemPrompt = getCurrentSystemPrompt();
    onStatus?.("planning", activeModes.thinking ? "Thinking..." : "Processing request...");

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

    if (nextAction.type === "call_skill") {
      loadSkill(nextAction.skill, true);
      continue;
    }

    if (nextAction.type === "call_tool") {
      if (nextAction.tool === "execute_query") {
        const executeInput = getStructuredToolInput(nextAction.tool, nextAction.tool_input);
        const executeIntent = executeInput ? asText(executeInput.intent) : undefined;
        const shouldRequireEscalationConsent =
          executeIntent === "create_support_ticket" &&
          !isExplicitEscalationRequest(request.prompt);

        if (shouldRequireEscalationConsent) {
          onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
          finalResponseType = "text";
          finalPayload = undefined;
          finalMessage = "I can escalate this to a human specialist. Would you like me to proceed?";
          finalQuickActions = buildEscalationConsentQuickActions();
          finalFollowUp = "I can also continue helping here in chat if you prefer.";
          break;
        }
      }

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
      onStatus?.("artefact", "Generating document...");
      await applyArtifactAction(nextAction, { phase: "unified_loop" }, "agent.artefact.failed_unified");
      break;
    }

    if (nextAction.type === "respond") {
      const hasSuccessfulWebSearch = toolResults.some(
        (result) => result.tool === "search_api" && result.status === "success",
      );
      const hasAttemptedWebSearch = toolResults.some((result) => result.tool === "search_api");
      const shouldEnforceWebSearch =
        activeModes.research &&
        availableActionTools.includes("search_api") &&
        toolCalls < maxToolCalls &&
        requiresWebSearchEvidence(request.prompt) &&
        !hasSuccessfulWebSearch &&
        !hasAttemptedWebSearch;

      if (shouldEnforceWebSearch) {
        onStatus?.("tool", "Searching the web...");
        const searchOutcome = await executeTool(
          "search_api",
          request.prompt.slice(0, 300),
          correlationId,
          user,
          ipAddress,
        );
        toolCalls += 1;
        toolResults.push(searchOutcome);
        stepResults.push(buildToolStepResult(stepResults.length + 1, searchOutcome));
        continue;
      }

      const hasVerifiedProductRecords = extractProductRecords(toolResults).length > 0;
      const requestedSku = extractSkuFromText(request.prompt);
      const hasAttemptedSkuDetailLookup = toolResults.some((result) => {
        if (result.tool !== "execute_query") {
          return false;
        }
        const input = getStructuredToolInput(result.tool, result.toolInput);
        if (!input || asText(input.intent) !== "get_product_detail") {
          return false;
        }
        const params =
          input.params && typeof input.params === "object" && !Array.isArray(input.params)
            ? (input.params as Record<string, unknown>)
            : undefined;
        const attemptedSku = params ? asText(params.sku)?.toUpperCase() : undefined;
        return Boolean(requestedSku && attemptedSku === requestedSku);
      });
      const shouldEnforceSkuDetailLookup =
        Boolean(requestedSku) &&
        availableActionTools.includes("execute_query") &&
        toolCalls < maxToolCalls &&
        !hasVerifiedProductRecords &&
        !hasAttemptedSkuDetailLookup;

      if (shouldEnforceSkuDetailLookup) {
        onStatus?.("tool", "Checking product details with live Velora data...");
        const skuDetailOutcome = await executeTool(
          "execute_query",
          {
            domain: "commerce",
            intent: "get_product_detail",
            params: { sku: requestedSku },
            filters: {},
          },
          correlationId,
          user,
          ipAddress,
        );
        toolCalls += 1;
        toolResults.push(skuDetailOutcome);
        stepResults.push(buildToolStepResult(stepResults.length + 1, skuDetailOutcome));
        continue;
      }

      const hasAttemptedProductLookup = toolResults.some((result) => {
        if (result.tool !== "execute_query") {
          return false;
        }
        const input = getStructuredToolInput(result.tool, result.toolInput);
        return Boolean(input && asText(input.intent) === "search_products");
      });
      const shouldEnforceProductLookup =
        nextAction.response_type === "product_card" &&
        availableActionTools.includes("execute_query") &&
        toolCalls < maxToolCalls &&
        !hasVerifiedProductRecords &&
        !hasAttemptedProductLookup;

      if (shouldEnforceProductLookup) {
        onStatus?.("tool", "Checking product details with live Velora data...");
        const productLookupOutcome = await executeTool(
          "execute_query",
          {
            domain: "commerce",
            intent: "search_products",
            params: {},
            filters: { query: request.prompt, limit: 5 },
          },
          correlationId,
          user,
          ipAddress,
        );
        toolCalls += 1;
        toolResults.push(productLookupOutcome);
        stepResults.push(buildToolStepResult(stepResults.length + 1, productLookupOutcome));
        continue;
      }

      const hasSuccessfulLoyaltyHistory = toolResults.some((result) => {
        if (result.tool !== "execute_query" || result.status !== "success") {
          return false;
        }
        const input = getStructuredToolInput(result.tool, result.toolInput);
        return Boolean(input && asText(input.intent) === "get_loyalty_history");
      });
      const shouldEnforceLoyaltyHistoryCheck =
        availableActionTools.includes("execute_query") &&
        toolCalls < maxToolCalls &&
        requiresLoyaltyHistoryConfirmation(request.prompt) &&
        !hasSuccessfulLoyaltyHistory;

      if (shouldEnforceLoyaltyHistoryCheck) {
        onStatus?.("tool", "Checking recent loyalty activity...");
        const loyaltyOutcome = await executeTool(
          "execute_query",
          {
            domain: "commerce",
            intent: "get_loyalty_history",
            params: {},
            filters: { limit: 5 },
          },
          correlationId,
          user,
          ipAddress,
        );
        toolCalls += 1;
        toolResults.push(loyaltyOutcome);
        stepResults.push(buildToolStepResult(stepResults.length + 1, loyaltyOutcome));
        continue;
      }

      const hasSuccessfulLiveData = toolResults.some(
        (result) => result.tool === "execute_query" && result.status === "success",
      );
      const shouldEnforceLiveCommerceCheck =
        availableActionTools.includes("execute_query") &&
        toolCalls < maxToolCalls &&
        !hasSuccessfulLiveData &&
        requiresLiveCommerceConfirmation(request.prompt);

      if (shouldEnforceLiveCommerceCheck) {
        const contextText = [
          request.prompt,
          ...history.map((item) => item.text),
        ].join("\n");
        const hasReturnOrRefundIntent = /\b(return|returns|refund|exchange)\b/.test(contextText.toLowerCase());

        const returnNumber = extractReturnNumberFromText(contextText);
        const orderNumber = extractOrderNumberFromText(contextText);

        if (returnNumber) {
          onStatus?.("tool", "Confirming return details with live Velora data...");
          const liveOutcome = await executeTool(
            "execute_query",
            {
              domain: "commerce",
              intent: "get_return_status",
              params: { return_number: returnNumber },
              filters: {},
            },
            correlationId,
            user,
            ipAddress,
          );
          toolCalls += 1;
          toolResults.push(liveOutcome);
          stepResults.push(buildToolStepResult(stepResults.length + 1, liveOutcome));
          continue;
        }

        if (orderNumber) {
          if (hasReturnOrRefundIntent) {
            onStatus?.("tool", "Checking for an existing return with live Velora data...");
            const returnLookupOutcome = await executeTool(
              "execute_query",
              {
                domain: "commerce",
                intent: "query_returns",
                params: {},
                filters: { order_number: orderNumber },
              },
              correlationId,
              user,
              ipAddress,
            );
            toolCalls += 1;
            toolResults.push(returnLookupOutcome);
            stepResults.push(buildToolStepResult(stepResults.length + 1, returnLookupOutcome));
            continue;
          }

          onStatus?.("tool", "Confirming order details with live Velora data...");
          const liveOutcome = await executeTool(
            "execute_query",
            {
              domain: "commerce",
              intent: "get_order_detail",
              params: { order_number: orderNumber },
              filters: {},
            },
            correlationId,
            user,
            ipAddress,
          );
          toolCalls += 1;
          toolResults.push(liveOutcome);
          stepResults.push(buildToolStepResult(stepResults.length + 1, liveOutcome));
          continue;
        }

        onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
        finalResponseType = "text";
        finalMessage =
          "I can confirm this with live Velora data, but I need your order or return number first (for example ORD-10020 or RET-0001).";
        finalQuickActions = [
          {
            label: "Share order number",
            prompt: "My order number is ORD-",
          },
          {
            label: "Share return number",
            prompt: "My return number is RET-",
          },
        ];
        finalFollowUp = "Once you share the identifier, I will run a live check before advising next steps.";
        break;
      }

      // RAG enforcement: if the policy skill was loaded but query_policy has not yet
      // been called successfully, force a retrieval before accepting the response.
      // This prevents the LLM from answering policy questions from training knowledge alone.
      if (
        loadedSkills.has("policy_rag_skill") &&
        toolCalls < maxToolCalls &&
        !toolResults.some((r) => r.tool === "query_policy" && r.status === "success")
      ) {
        onStatus?.("tool", "Checking Velora policies...");
        const policyQuery = request.prompt.slice(0, 300);
        const policyOutcome = await executeTool(
          "query_policy",
          { query: policyQuery, top_k: 3 },
          correlationId,
          user,
          ipAddress,
        );
        toolCalls += 1;
        toolResults.push(policyOutcome);
        stepResults.push(buildToolStepResult(stepResults.length + 1, policyOutcome));
        logEvent("info", "agent.rag.enforced", correlationId, {
          tool: "query_policy",
          status: policyOutcome.status,
        });
        // Continue the loop so the LLM can incorporate the retrieved policy chunks.
        continue;
      }

      onStatus?.("responding", RESPONSE_STATUS_MESSAGE);
      applyRespondAction(nextAction);
      break;
    }
  }

  if (!finalMessage) {
    const latestPolicyResult = [...toolResults]
      .reverse()
      .find((result) => result.status === "success" && result.tool === "query_policy");

    if (latestPolicyResult) {
      const policyPayload = latestPolicyResult.data.payload as Record<string, unknown> | undefined;
      const chunks = Array.isArray(policyPayload?.chunks)
        ? (policyPayload.chunks as Array<Record<string, unknown>>)
            .filter((chunk) => typeof chunk?.chunk_text === "string" && typeof chunk?.policy_title === "string")
            .slice(0, 3)
        : [];
      const formattedText = asText(policyPayload?.formatted_text)
        || chunks
          .map((chunk) => `[Policy: ${asText(chunk.policy_title) || "Velora Policy"}]\n${asText(chunk.chunk_text)}`)
          .join("\n\n");

      if (formattedText) {
        finalResponseType = "text";
        finalMessage = `Based on the retrieved Velora policy text:\n\n${formattedText}`;
        finalPolicyCitations = chunks
          .map((chunk) => ({
            policy_title: asText(chunk.policy_title) || "Velora Policy",
            excerpt: asText(chunk.chunk_text) || "",
          }))
          .filter(
            (citation): citation is { policy_title: string; excerpt: string } =>
              citation.excerpt.trim().length > 0,
          );
        finalSummary = `Retrieved ${chunks.length || 1} relevant policy chunk${chunks.length === 1 ? "" : "s"}.`;
        finalFollowUp = finalFollowUp ?? "If you want, I can apply this policy to a specific order or product.";
      }
    }

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
    })
    .concat(
      stepResults
        .filter(
          (s) =>
            s.tool === "query_policy" &&
            s.status === "success" &&
            s.data?.kind === "policy" &&
            typeof s.data.payload === "object" &&
            s.data.payload !== null &&
            Array.isArray((s.data.payload as { chunks?: unknown }).chunks),
        )
        .flatMap((s) => {
          const chunks = (s.data.payload as {
            chunks: Array<{ policy_title?: string; chunk_text?: string }>;
          }).chunks;
          return chunks.map((chunk) => ({
            label: "Policy",
            source: chunk.policy_title?.trim() || "Velora Policy",
            uri: undefined,
            image: undefined,
          }));
        }),
    );

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
  const enforceLowConfidenceGate = requiresGroundedConfidence(request.prompt, finalResponseType);
  const confidenceScore = getConfidenceScore(toolResults, {
    prompt: request.prompt,
    responseType: finalResponseType,
    payload: finalPayload,
    user,
  });
  const confidenceApplied = applyConfidencePolicy(finalMessage, confidenceScore, finalResponseType, enforceLowConfidenceGate);
  finalMessage = confidenceApplied.message;
  finalResponseType = confidenceApplied.responseType ?? finalResponseType;
  finalSummary = confidenceApplied.summary ?? finalSummary;
  finalFollowUp = confidenceApplied.followUp ?? finalFollowUp;
  finalRefusalReasonCode = confidenceApplied.refusalReasonCode ?? finalRefusalReasonCode;
  finalConfidenceScore = finalConfidenceScore ?? confidenceScore;

  // Some model outputs communicate escalation in message text but label response_type as text.
  // Promote these to escalation UI for a consistent interface.
  if (finalResponseType === "text" && looksLikeEscalationNarrative(finalMessage)) {
    const escalationContextText = [
      finalMessage,
      request.prompt,
      ...history.map((item) => item.text),
    ].join("\n");
    if (extractTicketNumberFromText(escalationContextText)) {
      finalResponseType = "escalation";
    }
  }

  const hasSuccessfulWebSearch = toolResults.some(
    (result) => result.tool === "search_api" && result.status === "success",
  );
  const normalizedProductsForComparison = extractNormalizedProducts(toolResults);
  const shouldBlockUnwarrantedEscalation =
    finalResponseType === "escalation" &&
    requiresWebSearchEvidence(request.prompt) &&
    hasSuccessfulWebSearch &&
    normalizedProductsForComparison.length > 0 &&
    !isExplicitEscalationRequest(request.prompt);

  if (shouldBlockUnwarrantedEscalation) {
    finalResponseType = "text";
    finalPayload = undefined;
    finalSummary = undefined;
    finalMessage = `I found grounded web sources and ${normalizedProductsForComparison.length} matching Velora product${normalizedProductsForComparison.length === 1 ? "" : "s"}, so I can continue with the comparison.`;

    const shouldRenderMultiProductTable =
      normalizedProductsForComparison.length > 1 &&
      shouldUseMultiProductTable(request.prompt);
    if (shouldRenderMultiProductTable) {
      const hasExistingTable = finalUiActions.some((action) => action.type === "table");
      if (!hasExistingTable) {
        finalUiActions = [...finalUiActions, ...buildMultiProductTableActions(normalizedProductsForComparison)];
      }
    }

    const normalizedExisting = normalizeQuickActions(finalQuickActions);
    finalQuickActions = normalizedExisting.length > 0
      ? normalizedExisting
      : buildMultiProductQuickActions(normalizedProductsForComparison);
    finalFollowUp = finalFollowUp ?? "Tell me if you want me to prioritize ANC, battery, codec support, or price in the final comparison.";
  }

  const shouldRequireEscalationConsent =
    finalResponseType === "escalation" &&
    !isExplicitEscalationRequest(request.prompt);

  if (shouldRequireEscalationConsent) {
    finalResponseType = "text";
    finalPayload = undefined;
    finalSummary = undefined;
    finalMessage = "I can escalate this to a human specialist. Would you like me to proceed?";
    finalQuickActions = buildEscalationConsentQuickActions();
    finalFollowUp = "I can also continue helping here in chat if you prefer.";
  }

  if (finalResponseType === "product_card") {
    const normalizedProductPayload = normalizeProductPayload(finalPayload, toolResults);
    if (!normalizedProductPayload) {
      finalResponseType = "text";
      finalPayload = undefined;
      finalQuickActions = undefined;
      finalSummary = undefined;
      finalFollowUp =
        "I can retry the lookup, but I won\'t fill product fields unless they are returned by Velora data.";
      finalMessage =
        "I couldn\'t retrieve verified product details from Velora data for that request right now.";
    } else {
      const normalizedProducts = extractNormalizedProducts(toolResults);
      const shouldRenderMultiProductTable =
        normalizedProducts.length > 1 &&
        shouldUseMultiProductTable(request.prompt);

      if (shouldRenderMultiProductTable) {
        finalResponseType = "text";
        finalPayload = undefined;
        finalSummary = undefined;
        finalMessage = `I found ${normalizedProducts.length} matching products. I summarized them in a comparison table below.`;

        const hasExistingTable = finalUiActions.some((action) => action.type === "table");
        if (!hasExistingTable) {
          finalUiActions = [...finalUiActions, ...buildMultiProductTableActions(normalizedProducts)];
        }

        const normalizedExisting = normalizeQuickActions(finalQuickActions);
        finalQuickActions = normalizedExisting.length > 0
          ? normalizedExisting
          : buildMultiProductQuickActions(normalizedProducts);
        finalFollowUp = finalFollowUp ?? "Tell me which SKU you want and I will open full product details.";
      } else {
        finalPayload = normalizedProductPayload;

        const trimmedMessage = finalMessage.trim();
        const isGenericMessage =
          !trimmedMessage ||
          /^here are (the )?details/i.test(trimmedMessage) ||
          trimmedMessage.split(/\s+/).length < 14;

        if (isGenericMessage) {
          finalMessage = buildProductNarrative(normalizedProductPayload, request.prompt);
        }

        finalQuickActions = mergeProductQuickActions(normalizedProductPayload, finalQuickActions);
        if (!finalFollowUp) {
          finalFollowUp = deriveProductFollowUpFromQuickActions(finalQuickActions);
        }
        // Product cards are already a compact summary UI; avoid a second redundant summary block.
        finalSummary = undefined;
      }
    }
  }

  if (finalResponseType === "order_card") {
    const historyEntries = extractOrderHistoryEntries(toolResults);
    const executeQueryIntents = getExecuteQueryIntents(toolResults);
    const promptLooksLikeHistory = /order history|orders history|recent orders|past orders|all orders/i.test(request.prompt);
    const hasHistoryIntent = executeQueryIntents.has("get_order_history") || executeQueryIntents.has("query_orders");

    if ((hasHistoryIntent || promptLooksLikeHistory) && historyEntries.length > 1) {
      finalResponseType = "text";
      finalPayload = undefined;
      finalMessage = buildOrderHistoryNarrative(historyEntries);
      const historyActions = buildOrderHistoryQuickActions(historyEntries);
      const normalizedExisting = normalizeQuickActions(finalQuickActions);
      finalQuickActions = normalizedExisting.length > 0
        ? normalizedExisting
        : historyActions;
      finalFollowUp = finalFollowUp ?? "Tell me which order number you want to inspect in detail.";
    } else {
    const normalizedOrderPayload = normalizeOrderPayload(finalPayload, toolResults);
    if (normalizedOrderPayload) {
      finalPayload = normalizedOrderPayload;
      finalMessage = buildOrderNarrative(normalizedOrderPayload);
      finalQuickActions = mergeOrderQuickActions(normalizedOrderPayload, finalQuickActions);
    } else {
      finalResponseType = "text";
      finalPayload = undefined;
      finalMessage = "I couldn't retrieve verified order details from Velora data for that request right now.";
      finalFollowUp = "If you want, I can retry the lookup using the order number.";
    }
    }
  }

  if (finalResponseType === "loyalty_card") {
    const normalizedLoyaltyPayload = normalizeLoyaltyPayload(finalPayload, toolResults, user);
    if (normalizedLoyaltyPayload) {
      finalPayload = normalizedLoyaltyPayload;
      finalMessage = buildLoyaltyNarrative(normalizedLoyaltyPayload);
    } else {
      finalResponseType = "text";
      finalPayload = undefined;
      finalMessage = "I couldn't retrieve verified loyalty details from Velora data for that request right now.";
      finalFollowUp = "If you want, I can retry the loyalty lookup.";
    }
  }

  if (finalResponseType === "escalation") {
    const escalationContextText = [
      finalMessage,
      request.prompt,
      ...history.map((item) => item.text),
    ].join("\n");

    const parsedEscalation = escalationPayloadSchema.safeParse(finalPayload);
    finalPayload = parsedEscalation.success
      ? parsedEscalation.data
      : buildFallbackEscalationPayload(finalPayload, finalMessage, escalationContextText);

    finalSummary = undefined;
    finalShowSources = false;
  }

  if (!shouldIncludeSummary(finalResponseType, finalMessage, finalSummary)) {
    finalSummary = undefined;
  }

  const hasPolicyCitations = Array.isArray(finalPolicyCitations) && finalPolicyCitations.length > 0;

  // Informational policy answers should not appear as declined requests.
  // Keep refusal for true blocked actions (account-specific or operational requests).
  if (
    finalResponseType === "refusal" &&
    finalRefusalReasonCode === "policy_restriction" &&
    hasPolicyCitations &&
    isInformationalPolicyQuestion(request.prompt)
  ) {
    finalResponseType = "text";
    finalPayload = undefined;
    finalSummary = undefined;

    const normalizedActions = normalizeQuickActions(finalQuickActions);
    finalQuickActions = normalizedActions.length > 0
      ? normalizedActions
      : [
          {
            label: "Check order eligibility",
            prompt: "Check if a specific order is eligible under this policy.",
          },
        ];

    finalFollowUp = finalFollowUp ?? "If you want, I can apply this policy to a specific order.";
  }

  if (finalResponseType === "refusal") {
    finalRefusalReasonCode =
      finalRefusalReasonCode
      ?? inferRefusalReasonCode(finalPayload, finalMessage, finalSummary);

    const refusalCopy = getRefusalCopy(finalRefusalReasonCode);
    finalSummary = finalSummary ?? refusalCopy.summary;

    const parsedRefusal = refusalPayloadSchema.safeParse(finalPayload);
    if (parsedRefusal.success) {
      finalPayload = {
        ...parsedRefusal.data,
        reason_code: parsedRefusal.data.reason_code ?? finalRefusalReasonCode,
      };
    } else {
      finalPayload = buildFallbackRefusalPayload(
        finalPayload,
        finalMessage,
        finalSummary,
        finalRefusalReasonCode,
      );
    }

    if (finalRefusalReasonCode === "low_confidence") {
      finalFollowUp = finalFollowUp ?? "If you want, I can help you continue with a support escalation.";
    }

    finalQuickActions = buildRefusalQuickActions(finalPayload);
  }

  finalConfidenceScore = getEffectiveConfidenceScore(
    confidenceScore,
    finalConfidenceScore,
    finalResponseType,
    finalRefusalReasonCode,
    enforceLowConfidenceGate,
  );

  if (finalResponseType === "refusal" || finalResponseType === "escalation") {
    await logAuditEvent({
      customer_id: user.customer_id,
      customer_email: user.email,
      event_type: finalResponseType === "refusal" ? "refusal_triggered" : "escalation_triggered",
      domain: "commerce",
      intent: routedCapabilities.skills[0] ?? "general_support",
      params_snapshot: {
        prompt: request.prompt,
        session_id: request.session_id,
        confidence_score: finalConfidenceScore,
      },
      reason:
        finalSummary ??
        (finalResponseType === "refusal"
          ? "Low-confidence or policy-bound refusal was returned."
          : "Escalation flow initiated."),
      ip_address: ipAddress ?? null,
    });
  }

  return {
    response_type: finalResponseType,
    message: finalMessage,
    message_text: finalMessage,
    payload: finalPayload,
    policy_citations: finalPolicyCitations,
    quick_actions: finalQuickActions,
    ui_actions: finalUiActions,
    citations,
    tool_trace: trace,
    confidence_score: finalConfidenceScore,
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
