// Enforces deterministic RBAC before and after structured domain queries.

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { aletiaAdapter } from "../adapters/aletia/aletiaAdapter.js";
import { sanitizeAccessRequestInput } from "../accessRequests/sanitizeAccessRequest.js";
import { logAuditEvent } from "../audit/auditLogger.js";
import type { AuthenticatedUser } from "../auth/types.js";
import { env } from "../config.js";
import { createAccessRequest } from "../db/repositories/accessRequestsRepo.js";
import { COLUMN_POLICY, HARD_BLOCKED_COLUMNS } from "../rbac/columnPolicy.js";
import { mapAccessRole } from "../rbac/roleMapping.js";
import type { ToolContext, ToolResult, ToolResultKind } from "./types.js";

const executeQuerySchema = z.object({
  domain: z.enum(["hr", "rbac"]).describe("The data domain to query"),
  intent: z
    .string()
    .describe("The query intent - must match a valid intent for the specified domain"),
  params: z
    .record(z.any())
    .optional()
    .default({})
    .describe("Path-level parameters such as employee_number"),
  filters: z
    .record(z.any())
    .optional()
    .default({})
    .describe("Query-level filters such as status, department_id, date ranges, limit, page"),
});

const DEPARTMENT_SCOPED_INTENTS = new Set([
  "query_employees",
  "query_leave",
  "query_performance",
]);

const SELF_SERVICE_INTENTS = new Set([
  "get_employee_profile",
  "get_employee_summary",
  "query_leave",
  "get_leave_balance",
  "get_employee_payroll",
  "get_employee_performance",
  "get_employment_history",
]);

type QueryPayload = z.infer<typeof executeQuerySchema>;
type ScopeViolationReason = {
  reason: string;
};

const employeeStatusSchema = z.object({
  data: z.object({
    is_active: z.boolean(),
    role: z.string(),
    department: z.string(),
    entity: z.string(),
  }),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    return "Access was denied for this request.";
  }

  if (intent === "health_check" && payload.status === "ok") {
    return "Confirmed Aletia HR service availability.";
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.data)
      ? payload.data
      : null;

  if (rows) {
    return `Retrieved ${rows.length} HR records for ${intent}.`;
  }

  if (payload.not_found === true) {
    return `No HR record was found for ${intent}.`;
  }

  if (
    intent === "create_access_request" &&
    isPlainObject(payload.data) &&
    typeof payload.data.reference_number === "string"
  ) {
    return `Created access request ${payload.data.reference_number}.`;
  }

  return `Retrieved HR data for ${intent}.`;
}

function makeAccessDenied(reason = "Your role does not permit access to this data."): Record<string, unknown> {
  return {
    access_denied: true,
    reason,
  };
}

function getEffectiveAccessRole(user: AuthenticatedUser) {
  return user.access_role ?? mapAccessRole(user.role, user.department);
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
  const statusResult = await aletiaAdapter.execute("validate_employee_status", {
    employee_number: user.employee_number,
  });

  if (statusResult.not_found === true) {
    return { isActive: false, user };
  }

  const parsed = employeeStatusSchema.parse(statusResult);
  const refreshedUser = {
    ...user,
    role: parsed.data.role,
    department: parsed.data.department,
    entity: parsed.data.entity,
    access_role: mapAccessRole(parsed.data.role, parsed.data.department),
  } satisfies AuthenticatedUser;

  return {
    isActive: parsed.data.is_active,
    user: refreshedUser,
  };
}

function enforceScope(
  payload: QueryPayload,
  user: AuthenticatedUser,
): {
  params: Record<string, unknown>;
  filters: Record<string, unknown>;
  scopeViolations: ScopeViolationReason[];
} {
  const params = { ...payload.params };
  const filters = { ...payload.filters };
  const accessRole = getEffectiveAccessRole(user);
  const scopeViolations: ScopeViolationReason[] = [];

  // NOTE: Any future edits to these scope overrides must be security-audited.

  if (SELF_SERVICE_INTENTS.has(payload.intent)) {
    const suppliedEmployeeParam =
      typeof payload.params.employee_number === "string" ? payload.params.employee_number.trim() : "";
    const suppliedEmployeeFilter =
      typeof payload.filters.employee_number === "string" ? payload.filters.employee_number.trim() : "";

    if (
      (suppliedEmployeeParam && suppliedEmployeeParam !== user.employee_number) ||
      (suppliedEmployeeFilter && suppliedEmployeeFilter !== user.employee_number)
    ) {
      scopeViolations.push({
        reason: "Self-service scope override replaced an LLM-supplied employee identifier.",
      });
    }

    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    params.employee_number = user.employee_number;
    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    filters.employee_number = user.employee_number;

    return { params, filters, scopeViolations };
  }

  if (accessRole === "employee") {
    const suppliedEmployeeParam =
      typeof payload.params.employee_number === "string" ? payload.params.employee_number.trim() : "";
    const suppliedEmployeeFilter =
      typeof payload.filters.employee_number === "string" ? payload.filters.employee_number.trim() : "";

    if (
      (suppliedEmployeeParam && suppliedEmployeeParam !== user.employee_number) ||
      (suppliedEmployeeFilter && suppliedEmployeeFilter !== user.employee_number)
    ) {
      scopeViolations.push({
        reason: "Employee scope override replaced an LLM-supplied employee identifier.",
      });
    }

    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    params.employee_number = user.employee_number;
    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    filters.employee_number = user.employee_number;
  }

  if (accessRole === "manager") {
    const suppliedDepartmentParam =
      typeof payload.params.department === "string" ? payload.params.department.trim() : "";
    const suppliedDepartmentFilter =
      typeof payload.filters.department_name === "string"
        ? payload.filters.department_name.trim()
        : typeof payload.filters.department === "string"
          ? payload.filters.department.trim()
          : "";

    if (
      (suppliedDepartmentParam && suppliedDepartmentParam !== user.department) ||
      (suppliedDepartmentFilter && suppliedDepartmentFilter !== user.department)
    ) {
      scopeViolations.push({
        reason: "Manager scope override replaced an LLM-supplied department.",
      });
    }

    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    params.department = user.department;
    // SECURITY: unconditional override — LLM-supplied value is never trusted for scope
    filters.department_name = user.department;
  }

  if (accessRole === "manager" && !DEPARTMENT_SCOPED_INTENTS.has(payload.intent)) {
    delete filters.department_name;
  }

  return { params, filters, scopeViolations };
}

function recordBelongsToDepartment(record: Record<string, unknown>, department: string): boolean {
  return typeof record.department === "string" && record.department === department;
}

function recordBelongsToEmployee(record: Record<string, unknown>, employeeNumber: string): boolean {
  return typeof record.employee_number === "string" && record.employee_number === employeeNumber;
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

function verifyPostQueryScope(
  intent: string,
  payload: Record<string, unknown>,
  user: AuthenticatedUser,
): boolean {
  const accessRole = getEffectiveAccessRole(user);
  if (accessRole === "admin" || accessRole === "hr_officer" || intent === "health_check") {
    return true;
  }

  const records = getDataRecords(payload);
  if (records.length === 0) {
    return true;
  }

  if (SELF_SERVICE_INTENTS.has(intent)) {
    return records.every((record) => recordBelongsToEmployee(record, user.employee_number));
  }

  if (accessRole === "employee") {
    return records.every((record) => recordBelongsToEmployee(record, user.employee_number));
  }

  if (accessRole === "manager") {
    return records.every((record) => recordBelongsToDepartment(record, user.department));
  }

  return true;
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
    if (key === "meta" || key === "access_denied" || key === "reason" || key === "status" || key === "service" || key === "reference_number" || key === "requested_by" || key === "resource_requested") {
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

function aggregatePayroll(payload: Record<string, unknown>): Record<string, unknown> {
  const rows = getDataRecords(payload);
  const grouped = new Map<string, { department: string; currency: string; employee_count: number; total_gross_salary: number }>();

  for (const row of rows) {
    const department = typeof row.department === "string" ? row.department : "Unknown";
    const currency = typeof row.currency === "string" ? row.currency : "MUR";
    const grossSalary = Number(row.gross_salary ?? 0);
    const key = `${department}:${currency}`;
    const current = grouped.get(key) ?? {
      department,
      currency,
      employee_count: 0,
      total_gross_salary: 0,
    };

    current.employee_count += 1;
    current.total_gross_salary += grossSalary;
    grouped.set(key, current);
  }

  return {
    data: Array.from(grouped.values()).map((row) => ({
      ...row,
      average_gross_salary: row.employee_count === 0 ? 0 : Number((row.total_gross_salary / row.employee_count).toFixed(2)),
    })),
    meta: {
      total: grouped.size,
      page: 1,
      limit: grouped.size,
      pages: grouped.size === 0 ? 0 : 1,
    },
  };
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
    requestedBy: user.employee_number,
    requestedRole: getEffectiveAccessRole(user),
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
    "Execute a query against a supported data domain with deterministic server-side RBAC enforcement. Supported domains: hr, rbac. Always call the querydb skill first to understand the correct intent, params, and filters to use before calling this tool.",
  schema: executeQuerySchema,
  func: async ({ domain, intent, params, filters }) => {
    switch (domain) {
      case "hr": {
        const result = await aletiaAdapter.execute(intent, params, filters);
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
    intent: input.intent,
    params: isPlainObject(input.params) ? input.params : {},
    filters: isPlainObject(input.filters) ? input.filters : {},
  });

  const user = ensureUser(context);
  const refreshed = await refreshUserContext(user);
  if (!refreshed.isActive) {
    const denied = makeAccessDenied("Your account is no longer active. Please contact HR.");
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
        source: payload.domain === "rbac" ? "Copilot RBAC" : "Aletia HR Platform",
        uri: payload.domain === "hr" ? env.ALETIA_API_URL : undefined,
      },
    };
  }

  const effectiveUser = refreshed.user;
  const accessRole = getEffectiveAccessRole(effectiveUser);
  const policy = COLUMN_POLICY[accessRole];
  const isSelfServiceIntent = SELF_SERVICE_INTENTS.has(payload.intent);

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
        source: "Copilot RBAC",
      },
    };
  }

  if (!policy.allowedIntents.includes(payload.intent) && !isSelfServiceIntent) {
    const denied = makeAccessDenied();
    await logAuditEvent({
      employee_number: effectiveUser.employee_number,
      full_name: effectiveUser.full_name,
      role: effectiveUser.access_role,
      event_type: "access_denied",
      domain: payload.domain,
      intent: payload.intent,
      params_snapshot: {
        params: payload.params,
        filters: payload.filters,
      },
      reason: "RBAC policy denied this intent for the current user.",
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
        label: "domain:hr",
        source: "Aletia HR Platform",
        uri: env.ALETIA_API_URL,
      },
    };
  }

  const scopedPayload = enforceScope(payload, effectiveUser);
  for (const violation of scopedPayload.scopeViolations) {
    await logAuditEvent({
      employee_number: effectiveUser.employee_number,
      full_name: effectiveUser.full_name,
      role: effectiveUser.access_role,
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

  const rawResult = await aletiaAdapter.execute(payload.intent, scopedPayload.params, scopedPayload.filters);
  let parsedResult = rawResult as Record<string, unknown>;

  if (!verifyPostQueryScope(payload.intent, parsedResult, effectiveUser)) {
    const denied = makeAccessDenied();
    await logAuditEvent({
      employee_number: effectiveUser.employee_number,
      full_name: effectiveUser.full_name,
      role: effectiveUser.access_role,
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
  } else if (accessRole === "finance_officer" && payload.intent === "query_payroll") {
    parsedResult = aggregatePayroll(parsedResult);
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
      label: "domain:hr",
      source: "Aletia HR Platform",
      uri: env.ALETIA_API_URL,
    },
  };
}
