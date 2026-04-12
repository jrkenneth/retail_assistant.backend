import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { sanitizeAccessRequestInput } from "../accessRequests/sanitizeAccessRequest.js";
import { ecommerceAdapter } from "../adapters/ecommerce/ecommerceAdapter.js";
import { logAuditEvent } from "../audit/auditLogger.js";
import type { AuthenticatedUser } from "../auth/types.js";
import { env } from "../config.js";
import { createAccessRequest } from "../db/repositories/accessRequestsRepo.js";
import { COLUMN_POLICY, HARD_BLOCKED_COLUMNS } from "../rbac/columnPolicy.js";
import type { ToolContext, ToolResult, ToolResultKind } from "./types.js";

const executeQuerySchema = z.object({
  domain: z.enum(["commerce", "rbac"]).describe("The data domain to query"),
  intent: z.string().describe("The query intent for the specified domain"),
  params: z.record(z.any()).optional().default({}),
  filters: z.record(z.any()).optional().default({}),
});

const EXECUTE_QUERY_INTENT_ALIASES: Record<string, string> = {
  get_order_status: "track_order",
  retrieve_order_status: "track_order",
  get_order_tracking: "track_order",
  get_order_details: "get_order_detail",
  retrieve_order_details: "get_order_detail",
  get_order_info: "get_order_detail",
  list_order_items: "get_order_items",
  get_loyalty_transactions: "get_loyalty_history",
  query_loyalty_transactions: "get_loyalty_history",
  get_loyalty_activity: "get_loyalty_history",
  query_loyalty_activity: "get_loyalty_history",
  retrieve_policy: "query_policy_documents",
  get_policy_details: "query_policy_documents",
  fetch_policy: "query_policy_documents",
};

function normalizeExecuteQueryIntent(intent: string): string {
  const trimmed = intent.trim();
  if (!trimmed) {
    return trimmed;
  }
  return EXECUTE_QUERY_INTENT_ALIASES[trimmed] ?? EXECUTE_QUERY_INTENT_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

const CUSTOMER_SCOPED_INTENTS = new Set([
  "get_customer_profile",
  "get_order_history",
  "get_order_detail",
  "track_order",
  "get_order_items",
  "initiate_return",
  "get_return_status",
  "query_returns",
  "get_return_detail",
  "query_support_tickets",
  "get_support_ticket",
  "create_support_ticket",
  "get_loyalty_balance",
  "get_loyalty_history",
  "get_loyalty_summary",
]);

const ORDER_IDENTIFIER_INTENTS = new Set([
  "track_order",
  "get_order_items",
]);

type QueryPayload = z.infer<typeof executeQuerySchema>;

const customerStatusSchema = z.object({
  data: z.object({
    customer_id: z.string().optional().default(""),
    account_status: z.string(),
    loyalty_points: z.coerce.number(),
    email: z.string(),
    first_name: z.string().optional().default(""),
    last_name: z.string().optional().default(""),
    full_name: z.string(),
    customer_number: z.string(),
  }),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function makeAccessDenied(reason = "This request is not permitted for the current customer account.") {
  return {
    access_denied: true,
    reason,
  };
}

function ensureUser(context?: ToolContext): AuthenticatedUser {
  if (!context?.user) {
    throw new Error("execute_query requires authenticated user context.");
  }
  return context.user;
}

async function refreshUserContext(user: AuthenticatedUser): Promise<{
  isActive: boolean;
  user: AuthenticatedUser;
}> {
  const statusResult = await ecommerceAdapter.execute("validate_customer_status", {
    customer_number: user.customer_number,
  });

  if (statusResult.not_found === true) {
    return { isActive: false, user };
  }

  const parsed = customerStatusSchema.parse(statusResult);
  const refreshedUser: AuthenticatedUser = {
    ...user,
    customer_id: parsed.data.customer_id || user.customer_id,
    customer_number: parsed.data.customer_number,
    first_name: parsed.data.first_name || user.first_name,
    last_name: parsed.data.last_name || user.last_name,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    account_status: parsed.data.account_status,
    loyalty_points: parsed.data.loyalty_points,
    role: "Customer",
    access_role: "customer",
    department: "Customers",
    entity: "Velora",
  };

  return {
    isActive: parsed.data.account_status === "active",
    user: refreshedUser,
  };
}

function inferExecuteQueryResultKind(
  intent: string,
  payload: Record<string, unknown>,
): ToolResultKind {
  if (intent === "health_check") {
    return "status";
  }

  if (Array.isArray(payload.rows) || Array.isArray(payload.data)) {
    return "list";
  }

  return "record";
}

function buildExecuteQuerySummary(intent: string, payload: Record<string, unknown>): string {
  if (payload.access_denied === true) {
    return "Access to that retail record was denied.";
  }

  if (intent === "health_check" && payload.status === "ok") {
    return "Confirmed Velora service availability.";
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.data)
      ? payload.data
      : null;

  if (rows) {
    return `Retrieved ${rows.length} Velora records for ${intent}.`;
  }

  if (payload.not_found === true) {
    return `No Velora record was found for ${intent}.`;
  }

  if (
    intent === "create_support_ticket" &&
    isPlainObject(payload.data) &&
    typeof payload.data.ticket_number === "string"
  ) {
    return `Created support ticket ${payload.data.ticket_number}.`;
  }

  if (
    intent === "create_access_request" &&
    isPlainObject(payload.data) &&
    typeof payload.data.reference_number === "string"
  ) {
    return `Created access request ${payload.data.reference_number}.`;
  }

  return `Retrieved Velora data for ${intent}.`;
}

function getDataRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(payload.data)) {
    return payload.data.filter(isPlainObject);
  }

  if (isPlainObject(payload.data)) {
    return [payload.data];
  }

  return [];
}

function sanitizeRecord(
  value: Record<string, unknown>,
  allowedColumns: Set<string>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (HARD_BLOCKED_COLUMNS.includes(key as (typeof HARD_BLOCKED_COLUMNS)[number])) {
      continue;
    }

    if (!allowedColumns.has(key)) {
      continue;
    }

    if (key === "specifications" && isPlainObject(entry)) {
      const specs: Record<string, unknown> = {};
      for (const [specKey, specValue] of Object.entries(entry)) {
        if (typeof specValue === "string" || typeof specValue === "number" || typeof specValue === "boolean") {
          specs[specKey] = specValue;
        }
      }
      output[key] = specs;
      continue;
    }

    if (Array.isArray(entry)) {
      output[key] = entry.map((item) => (isPlainObject(item) ? sanitizeRecord(item, allowedColumns) : item));
      continue;
    }

    if (isPlainObject(entry)) {
      output[key] = sanitizeRecord(entry, allowedColumns);
      continue;
    }

    output[key] = entry;
  }

  return output;
}

function sanitizePayload(
  payload: Record<string, unknown>,
  allowedColumns: readonly string[],
): Record<string, unknown> {
  const allowed = new Set(allowedColumns);
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (
      key === "meta" ||
      key === "access_denied" ||
      key === "reason" ||
      key === "status" ||
      key === "service" ||
      key === "reference_number" ||
      key === "requested_by" ||
      key === "resource_requested"
    ) {
      sanitized[key] = value;
      continue;
    }

    if (key === "data" && Array.isArray(value)) {
      sanitized[key] = value.filter(isPlainObject).map((row) => sanitizeRecord(row, allowed));
      continue;
    }

    if (key === "data" && isPlainObject(value)) {
      sanitized[key] = sanitizeRecord(value, allowed);
      continue;
    }

    if (allowed.has(key) && !HARD_BLOCKED_COLUMNS.includes(key as (typeof HARD_BLOCKED_COLUMNS)[number])) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function recordBelongsToCustomer(record: Record<string, unknown>, customerNumber: string): boolean {
  if (typeof record.customer_number === "string") {
    return record.customer_number === customerNumber;
  }

  if (Array.isArray(record.items)) {
    return true;
  }

  return false;
}

function verifyPostQueryScope(
  intent: string,
  payload: Record<string, unknown>,
  user: AuthenticatedUser,
): boolean {
  // This endpoint is path-scoped by customer_number and returns transaction rows
  // without a customer_number field per row.
  if (intent === "get_loyalty_history") {
    return true;
  }

  if (!CUSTOMER_SCOPED_INTENTS.has(intent)) {
    return true;
  }

  const records = getDataRecords(payload);
  if (records.length === 0) {
    return true;
  }

  return records.every((record) => recordBelongsToCustomer(record, user.customer_number));
}

async function verifyOrderOwnershipForIdentifierIntent(
  intent: string,
  params: Record<string, unknown>,
  user: AuthenticatedUser,
): Promise<boolean | undefined> {
  if (!ORDER_IDENTIFIER_INTENTS.has(intent)) {
    return undefined;
  }

  const orderNumber = typeof params.order_number === "string" ? params.order_number.trim() : "";
  if (!orderNumber) {
    return false;
  }

  const detail = await ecommerceAdapter.execute("get_order_detail", { order_number: orderNumber });
  if (detail.not_found === true) {
    // Order doesn't exist — let the actual tool call return a natural not-found
    // response rather than a misleading "not your order" access denial.
    return undefined;
  }

  const data = isPlainObject(detail.data) ? detail.data : null;
  const ownerNumber = data && typeof data.customer_number === "string" ? data.customer_number : "";
  if (!ownerNumber) {
    return false;
  }

  return ownerNumber === user.customer_number;
}

function enforceScope(
  payload: QueryPayload,
  user: AuthenticatedUser,
): {
  params: Record<string, unknown>;
  filters: Record<string, unknown>;
  scopeViolations: Array<{ reason: string }>;
} {
  const params = { ...payload.params };
  const filters = { ...payload.filters };
  const scopeViolations: Array<{ reason: string }> = [];

  if (CUSTOMER_SCOPED_INTENTS.has(payload.intent)) {
    const suppliedCustomerParam =
      typeof payload.params.customer_number === "string" ? payload.params.customer_number.trim() : "";
    const suppliedCustomerFilter =
      typeof payload.filters.customer_number === "string" ? payload.filters.customer_number.trim() : "";

    if (
      (suppliedCustomerParam && suppliedCustomerParam !== user.customer_number) ||
      (suppliedCustomerFilter && suppliedCustomerFilter !== user.customer_number)
    ) {
      scopeViolations.push({
        reason: "Customer scope override replaced an LLM-supplied customer identifier.",
      });
    }

    params.customer_number = user.customer_number;
    filters.customer_number = user.customer_number;
  }

  return { params, filters, scopeViolations };
}

async function handleRbacIntent(
  payload: QueryPayload,
  user: AuthenticatedUser,
): Promise<Record<string, unknown>> {
  if (payload.intent !== "create_access_request") {
    return makeAccessDenied();
  }

  const resourceRequested = typeof payload.params.resource_requested === "string"
    ? payload.params.resource_requested
    : "";
  const justification = typeof payload.params.justification === "string"
    ? payload.params.justification
    : "";

  if (!resourceRequested || !justification) {
    throw new Error("create_access_request requires resource_requested and justification.");
  }

  const sanitized = sanitizeAccessRequestInput(resourceRequested, justification);
  if (!sanitized.ok) {
    return { error: sanitized.error };
  }

  const timestamp = Date.now().toString(36).toUpperCase();
  const referenceNumber = `AR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${timestamp.slice(-6)}`;
  const row = await createAccessRequest({
    id: `access-${timestamp}`,
    referenceNumber,
    requestedBy: user.customer_number,
    requestedRole: user.access_role,
    resourceRequested: sanitized.resourceRequested,
    justification: sanitized.justification,
  });

  return {
    data: {
      reference_number: row.reference_number,
      requested_by: row.requested_by,
      resource_requested: row.resource_requested,
      status: row.status,
    },
  };
}

export const executeQueryTool = new DynamicStructuredTool({
  name: "execute_query",
  description:
    "Execute a query against a supported Velora retail data domain with deterministic server-side scope enforcement.",
  schema: executeQuerySchema,
  func: async ({ domain, intent, params, filters }) => {
    switch (domain) {
      case "commerce": {
        const result = await ecommerceAdapter.execute(intent, params, filters);
        return JSON.stringify(result);
      }
      default:
        throw new Error(`Domain "${domain}" cannot be invoked directly from the raw tool wrapper.`);
    }
  },
});

export async function executeQueryClient(
  input: unknown,
  context?: ToolContext,
): Promise<ToolResult<Record<string, unknown>>> {
  if (!isPlainObject(input)) {
    throw new Error("execute_query requires structured object input.");
  }

  const payload = executeQuerySchema.parse({
    domain: input.domain,
    intent: normalizeExecuteQueryIntent(typeof input.intent === "string" ? input.intent : ""),
    params: isPlainObject(input.params) ? input.params : {},
    filters: isPlainObject(input.filters) ? input.filters : {},
  });

  const orderNumber = typeof payload.params.order_number === "string" ? payload.params.order_number.trim() : "";
  const returnNumber = typeof payload.params.return_number === "string" ? payload.params.return_number.trim() : "";

  if ((payload.intent === "get_return_status" || payload.intent === "get_return_detail") && !returnNumber && orderNumber) {
    payload.intent = "query_returns";
    payload.filters.order_number = orderNumber;
    delete payload.params.order_number;
  }

  if (payload.intent === "search_products" || payload.intent === "query_products") {
    const paramsQuery = typeof payload.params.query === "string" ? payload.params.query.trim() : "";
    const hasFiltersQuery =
      typeof payload.filters.query === "string" && payload.filters.query.trim().length > 0;

    if (!hasFiltersQuery && paramsQuery) {
      payload.filters.query = paramsQuery;
    }

    const paramsLimit = payload.params.limit;
    const paramsPage = payload.params.page;
    if (payload.filters.limit === undefined && paramsLimit !== undefined) {
      payload.filters.limit = paramsLimit;
    }
    if (payload.filters.page === undefined && paramsPage !== undefined) {
      payload.filters.page = paramsPage;
    }
  }

  if (payload.intent === "query_policy_documents") {
    const hasSearch = typeof payload.filters.search === "string" && payload.filters.search.trim().length > 0;
    if (!hasSearch) {
      const topic = typeof payload.filters.topic === "string" ? payload.filters.topic.trim() : "";
      const subtopic = typeof payload.filters.subtopic === "string" ? payload.filters.subtopic.trim() : "";
      const synthesizedSearch = [topic, subtopic].filter(Boolean).join(" ").trim();
      if (synthesizedSearch) {
        payload.filters.search = synthesizedSearch;
      }
    }
  }

  const user = ensureUser(context);
  const refreshed = await refreshUserContext(user);
  if (!refreshed.isActive) {
    const denied = makeAccessDenied("This Velora account is not active. Please contact support.");
    return {
      tool: "execute_query",
      version: "v1",
      data: {
        ok: true,
        kind: "record",
        payload: denied,
        summary: buildExecuteQuerySummary(payload.intent, denied),
      },
      citation: {
        label: `domain:${payload.domain}`,
        source: payload.domain === "rbac" ? "Lena RBAC" : "Velora Platform",
        uri: payload.domain === "commerce" ? env.VELORA_API_URL : undefined,
      },
    };
  }

  const effectiveUser = refreshed.user;
  const policy = COLUMN_POLICY[effectiveUser.access_role];

  if (payload.domain === "rbac") {
    const result = await handleRbacIntent(payload, effectiveUser);
    return {
      tool: "execute_query",
      version: "v1",
      data: {
        ok: true,
        kind: "record",
        payload: result,
        summary: buildExecuteQuerySummary(payload.intent, result),
      },
      citation: {
        label: "domain:rbac",
        source: "Lena RBAC",
      },
    };
  }

  if (!policy.allowedIntents.includes(payload.intent)) {
    const denied = makeAccessDenied();
    await logAuditEvent({
      customer_id: effectiveUser.customer_id,
      customer_email: effectiveUser.email,
      event_type: "access_denied",
      domain: payload.domain,
      intent: payload.intent,
      params_snapshot: {
        params: payload.params,
        filters: payload.filters,
      },
      reason: "Retail policy denied this intent for the current customer.",
      ip_address: context?.ipAddress ?? null,
    });
    return {
      tool: "execute_query",
      version: "v1",
      data: {
        ok: true,
        kind: "record",
        payload: denied,
        summary: buildExecuteQuerySummary(payload.intent, denied),
      },
      citation: {
        label: "domain:commerce",
        source: "Velora Platform",
        uri: env.VELORA_API_URL,
      },
    };
  }

  const scopedPayload = enforceScope(payload, effectiveUser);
  const verifiedOrderOwnership = await verifyOrderOwnershipForIdentifierIntent(
    payload.intent,
    scopedPayload.params,
    effectiveUser,
  );

  if (verifiedOrderOwnership === false) {
    const denied = makeAccessDenied("This order does not belong to the current customer account.");
    await logAuditEvent({
      customer_id: effectiveUser.customer_id,
      customer_email: effectiveUser.email,
      event_type: "access_denied",
      domain: payload.domain,
      intent: payload.intent,
      params_snapshot: {
        params: scopedPayload.params,
        filters: scopedPayload.filters,
      },
      reason: "Order ownership verification failed for identifier-based order intent.",
      ip_address: context?.ipAddress ?? null,
    });
    return {
      tool: "execute_query",
      version: "v1",
      data: {
        ok: true,
        kind: "record",
        payload: denied,
        summary: buildExecuteQuerySummary(payload.intent, denied),
      },
      citation: {
        label: "domain:commerce",
        source: "Velora Platform",
        uri: env.VELORA_API_URL,
      },
    };
  }

  for (const violation of scopedPayload.scopeViolations) {
    await logAuditEvent({
      customer_id: effectiveUser.customer_id,
      customer_email: effectiveUser.email,
      event_type: "scope_violation",
      domain: payload.domain,
      intent: payload.intent,
      params_snapshot: {
        params: payload.params,
        filters: payload.filters,
      },
      reason: violation.reason,
      ip_address: context?.ipAddress ?? null,
    });
  }

  const rawResult = await ecommerceAdapter.execute(payload.intent, scopedPayload.params, scopedPayload.filters);
  let parsedResult = rawResult as Record<string, unknown>;

  const skipPostQueryScope =
    verifiedOrderOwnership === true && ORDER_IDENTIFIER_INTENTS.has(payload.intent);

  if (!skipPostQueryScope && !verifyPostQueryScope(payload.intent, parsedResult, effectiveUser)) {
    const denied = makeAccessDenied("Returned records could not be verified as belonging to the current customer account.");
    await logAuditEvent({
      customer_id: effectiveUser.customer_id,
      customer_email: effectiveUser.email,
      event_type: "access_denied",
      domain: payload.domain,
      intent: payload.intent,
      params_snapshot: {
        params: scopedPayload.params,
        filters: scopedPayload.filters,
      },
      reason: "Post-query scope verification rejected the returned data.",
      ip_address: context?.ipAddress ?? null,
    });
    parsedResult = denied;
  }

  const sanitizedResult =
    parsedResult.access_denied === true
      ? parsedResult
      : sanitizePayload(parsedResult, policy.allowedColumns);

  return {
    tool: "execute_query",
    version: "v1",
    data: {
      ok: true,
      kind: inferExecuteQueryResultKind(payload.intent, sanitizedResult),
      payload: sanitizedResult,
      summary: buildExecuteQuerySummary(payload.intent, sanitizedResult),
    },
    citation: {
      label: "domain:commerce",
      source: "Velora Platform",
      uri: env.VELORA_API_URL,
    },
  };
}
