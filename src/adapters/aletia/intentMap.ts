// Maps HR intents to Aletia API routes and query parameter builders.

export interface AletiaIntentEntry {
  method: "GET" | "POST";
  buildPath: (params: Record<string, any>) => string;
  buildQuery: (filters: Record<string, any>) => Record<string, any>;
  buildBody?: (params: Record<string, any>) => Record<string, any> | undefined;
}

function requireStringParam(params: Record<string, any>, key: string): string {
  const value = typeof params[key] === "string" ? params[key].trim() : "";
  if (!value) {
    throw new Error(`Aletia intent requires param "${key}".`);
  }
  return value;
}

function withPagination(filters: Record<string, any>) {
  return {
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
  };
}

export const ALETIA_INTENT_MAP: Record<string, AletiaIntentEntry> = {
  authenticate_user: {
    method: "POST",
    buildPath: () => "/api/v1/auth/login",
    buildQuery: () => ({}),
    buildBody: (params) => ({
      username: requireStringParam(params, "username"),
      password: requireStringParam(params, "password"),
    }),
  },
  query_employees: {
    method: "GET",
    buildPath: () => "/api/v1/employees",
    buildQuery: (filters) => ({
      ...(filters.first_name && { first_name: filters.first_name }),
      ...(filters.last_name && { last_name: filters.last_name }),
      ...(filters.full_name && { full_name: filters.full_name }),
      ...(filters.department_id && { department_id: filters.department_id }),
      ...(filters.department_name && { department_name: filters.department_name }),
      ...(filters.company_id && { company_id: filters.company_id }),
      ...(filters.entity_id && { entity_id: filters.entity_id }),
      ...(filters.manager_id && { manager_id: filters.manager_id }),
      ...(filters.employment_type && { employment_type: filters.employment_type }),
      ...(filters.status && { status: filters.status }),
      ...(filters.date_joined_from && { date_joined_from: filters.date_joined_from }),
      ...(filters.date_joined_to && { date_joined_to: filters.date_joined_to }),
      ...withPagination(filters),
    }),
  },
  get_employee_profile: {
    method: "GET",
    buildPath: (params) => `/api/v1/employees/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: () => ({}),
  },
  validate_employee_status: {
    method: "GET",
    buildPath: (params) => `/api/v1/employees/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: () => ({}),
  },
  get_employee_summary: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/employees/${encodeURIComponent(requireStringParam(params, "employee_number"))}/summary`,
    buildQuery: () => ({}),
  },
  query_leave: {
    method: "GET",
    buildPath: () => "/api/v1/leave",
    buildQuery: (filters) => ({
      ...(filters.employee_id && { employee_id: filters.employee_id }),
      ...(filters.employee_number && { employee_number: filters.employee_number }),
      ...(filters.first_name && { first_name: filters.first_name }),
      ...(filters.last_name && { last_name: filters.last_name }),
      ...(filters.full_name && { full_name: filters.full_name }),
      ...(filters.department_id && { department_id: filters.department_id }),
      ...(filters.department_name && { department_name: filters.department_name }),
      ...(filters.leave_type && { leave_type: filters.leave_type }),
      ...(filters.status && { status: filters.status }),
      ...(filters.date_from && { date_from: filters.date_from }),
      ...(filters.date_to && { date_to: filters.date_to }),
      ...withPagination(filters),
    }),
  },
  get_leave_balance: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/leave/balance/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: () => ({}),
  },
  query_payroll: {
    method: "GET",
    buildPath: () => "/api/v1/payroll",
    buildQuery: (filters) => ({
      ...(filters.first_name && { first_name: filters.first_name }),
      ...(filters.last_name && { last_name: filters.last_name }),
      ...(filters.full_name && { full_name: filters.full_name }),
      ...(filters.department_id && { department_id: filters.department_id }),
      ...(filters.department_name && { department_name: filters.department_name }),
      ...(filters.company_id && { company_id: filters.company_id }),
      ...withPagination(filters),
    }),
  },
  get_employee_payroll: {
    method: "GET",
    buildPath: (params) => `/api/v1/payroll/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: () => ({}),
  },
  query_performance: {
    method: "GET",
    buildPath: () => "/api/v1/performance",
    buildQuery: (filters) => ({
      ...(filters.employee_id && { employee_id: filters.employee_id }),
      ...(filters.employee_number && { employee_number: filters.employee_number }),
      ...(filters.first_name && { first_name: filters.first_name }),
      ...(filters.last_name && { last_name: filters.last_name }),
      ...(filters.full_name && { full_name: filters.full_name }),
      ...(filters.reviewer_id && { reviewer_id: filters.reviewer_id }),
      ...(filters.review_period && { review_period: filters.review_period }),
      ...(filters.status && { status: filters.status }),
      ...(filters.department_id && { department_id: filters.department_id }),
      ...(filters.department_name && { department_name: filters.department_name }),
      ...withPagination(filters),
    }),
  },
  get_employee_performance: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/performance/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: (filters) => ({
      ...withPagination(filters),
    }),
  },
  get_employment_history: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/history/${encodeURIComponent(requireStringParam(params, "employee_number"))}`,
    buildQuery: (filters) => ({
      ...(filters.date_from && { date_from: filters.date_from }),
      ...(filters.date_to && { date_to: filters.date_to }),
      ...(filters.change_reason && { change_reason: filters.change_reason }),
      ...withPagination(filters),
    }),
  },
  health_check: {
    method: "GET",
    buildPath: () => "/health",
    buildQuery: () => ({}),
  },
};
