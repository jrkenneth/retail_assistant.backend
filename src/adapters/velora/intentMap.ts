export interface VeloraIntentEntry {
  method: "GET" | "POST";
  buildPath: (params: Record<string, any>) => string;
  buildQuery: (filters: Record<string, any>) => Record<string, any>;
  buildBody?: (params: Record<string, any>) => Record<string, any> | undefined;
}

function requireStringParam(params: Record<string, any>, key: string): string {
  const value = typeof params[key] === "string" ? params[key].trim() : "";
  if (!value) {
    throw new Error(`Velora intent requires param "${key}".`);
  }
  return value;
}

function withPagination(filters: Record<string, any>) {
  return {
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
  };
}

export const VELORA_INTENT_MAP: Record<string, VeloraIntentEntry> = {
  authenticate_customer: {
    method: "POST",
    buildPath: () => "/api/v1/auth/login",
    buildQuery: () => ({}),
    buildBody: (params) => ({
      username: requireStringParam(params, "username"),
      password: requireStringParam(params, "password"),
    }),
  },
  validate_customer_status: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}/profile`,
    buildQuery: () => ({}),
  },
  get_customer_profile: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}/profile`,
    buildQuery: () => ({}),
  },
  query_products: {
    method: "GET",
    buildPath: () => "/api/v1/products",
    buildQuery: (filters) => ({
      ...(filters.category && { category: filters.category }),
      ...(filters.availability_status && { availability_status: filters.availability_status }),
      ...(filters.search && { search: filters.search }),
      ...(filters.is_promotion_eligible !== undefined && { is_promotion_eligible: filters.is_promotion_eligible }),
      ...(filters.min_price !== undefined && { min_price: filters.min_price }),
      ...(filters.max_price !== undefined && { max_price: filters.max_price }),
      ...withPagination(filters),
    }),
  },
  get_product_detail: {
    method: "GET",
    buildPath: (params) => `/api/v1/products/${encodeURIComponent(requireStringParam(params, "sku"))}`,
    buildQuery: () => ({}),
  },
  query_orders: {
    method: "GET",
    buildPath: () => "/api/v1/orders",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.order_number && { order_number: filters.order_number }),
      ...(filters.tracking_number && { tracking_number: filters.tracking_number }),
      ...(filters.status && { status: filters.status }),
      ...(filters.delivery_status && { delivery_status: filters.delivery_status }),
      ...withPagination(filters),
    }),
  },
  get_order_detail: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/orders/${encodeURIComponent(requireStringParam(params, "order_number"))}`,
    buildQuery: () => ({}),
  },
  query_returns: {
    method: "GET",
    buildPath: () => "/api/v1/returns",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.order_number && { order_number: filters.order_number }),
      ...(filters.status && { status: filters.status }),
      ...withPagination(filters),
    }),
  },
  get_return_detail: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/returns/${encodeURIComponent(requireStringParam(params, "return_number"))}`,
    buildQuery: () => ({}),
  },
  query_support_tickets: {
    method: "GET",
    buildPath: () => "/api/v1/support-tickets",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.order_number && { order_number: filters.order_number }),
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...withPagination(filters),
    }),
  },
  get_support_ticket: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/support-tickets/${encodeURIComponent(requireStringParam(params, "ticket_number"))}`,
    buildQuery: () => ({}),
  },
  create_support_ticket: {
    method: "POST",
    buildPath: () => "/api/v1/support-tickets",
    buildQuery: () => ({}),
    buildBody: (params) => ({
      customer_number: requireStringParam(params, "customer_number"),
      ...(params.order_number ? { order_number: params.order_number } : {}),
      subject: requireStringParam(params, "subject"),
      description: requireStringParam(params, "description"),
      priority: typeof params.priority === "string" ? params.priority : "medium",
      ...(params.queue_position !== undefined ? { queue_position: params.queue_position } : {}),
      ...(params.estimated_wait_minutes !== undefined
        ? { estimated_wait_minutes: params.estimated_wait_minutes }
        : {}),
    }),
  },
  get_loyalty_summary: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/loyalty/${encodeURIComponent(requireStringParam(params, "customer_number"))}`,
    buildQuery: (filters) => withPagination(filters),
  },
  query_policy_documents: {
    method: "GET",
    buildPath: () => "/api/v1/policies",
    buildQuery: (filters) => ({
      ...(filters.policy_key && { policy_key: filters.policy_key }),
      ...(filters.search && { search: filters.search }),
      ...withPagination(filters),
    }),
  },
  get_policy_document: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/policies/${encodeURIComponent(requireStringParam(params, "policy_key"))}`,
    buildQuery: () => ({}),
  },
  health_check: {
    method: "GET",
    buildPath: () => "/health",
    buildQuery: () => ({}),
  },
};
