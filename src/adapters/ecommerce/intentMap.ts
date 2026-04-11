export interface EcommerceIntentEntry {
  method: "GET" | "POST";
  buildPath: (params: Record<string, any>) => string;
  buildQuery: (filters: Record<string, any>) => Record<string, any>;
  buildBody?: (params: Record<string, any>) => Record<string, any> | undefined;
}

function requireStringParam(params: Record<string, any>, key: string): string {
  const value = typeof params[key] === "string" ? params[key].trim() : "";
  if (!value) {
    throw new Error(`Ecommerce intent requires param "${key}".`);
  }
  return value;
}

function withLimit(filters: Record<string, any>) {
  return {
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
    ...(filters.page !== undefined ? { page: filters.page } : {}),
  };
}

const EXACT_INTENT_MAP: Record<string, EcommerceIntentEntry> = {
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
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}/status`,
    buildQuery: () => ({}),
  },
  get_customer_profile: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}`,
    buildQuery: () => ({}),
  },
  get_order_history: {
    method: "GET",
    buildPath: () => "/api/v1/orders",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.status && { status: filters.status }),
      ...withLimit(filters),
    }),
  },
  get_order_detail: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/orders/${encodeURIComponent(requireStringParam(params, "order_number"))}`,
    buildQuery: () => ({}),
  },
  track_order: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/orders/${encodeURIComponent(requireStringParam(params, "order_number"))}/tracking`,
    buildQuery: () => ({}),
  },
  get_order_items: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/orders/${encodeURIComponent(requireStringParam(params, "order_number"))}/items`,
    buildQuery: () => ({}),
  },
  initiate_return: {
    method: "POST",
    buildPath: () => "/api/v1/returns",
    buildQuery: () => ({}),
    buildBody: (params) => ({
      customer_number: requireStringParam(params, "customer_number"),
      order_number: requireStringParam(params, "order_number"),
      reason: requireStringParam(params, "reason"),
    }),
  },
  get_return_status: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/returns/${encodeURIComponent(requireStringParam(params, "return_number"))}`,
    buildQuery: () => ({}),
  },
  get_loyalty_balance: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}/loyalty`,
    buildQuery: () => ({}),
  },
  get_loyalty_history: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/customers/${encodeURIComponent(requireStringParam(params, "customer_number"))}/loyalty/history`,
    buildQuery: (filters) => withLimit(filters),
  },
  search_products: {
    method: "GET",
    buildPath: () => "/api/v1/products",
    buildQuery: (filters) => ({
      ...(filters.query && { query: filters.query }),
      ...(filters.category && { category: filters.category }),
      ...(filters.availability && { availability: filters.availability }),
      ...withLimit(filters),
    }),
  },
  get_product_detail: {
    method: "GET",
    buildPath: (params) => `/api/v1/products/${encodeURIComponent(requireStringParam(params, "sku"))}`,
    buildQuery: () => ({}),
  },
  create_support_ticket: {
    method: "POST",
    buildPath: () => "/api/v1/support/tickets",
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
  get_support_ticket: {
    method: "GET",
    buildPath: (params) =>
      `/api/v1/support/tickets/${encodeURIComponent(requireStringParam(params, "ticket_number"))}`,
    buildQuery: () => ({}),
  },
};

export const ECOMMERCE_INTENT_MAP: Record<string, EcommerceIntentEntry> = {
  ...EXACT_INTENT_MAP,
  query_products: EXACT_INTENT_MAP.search_products,
  query_orders: EXACT_INTENT_MAP.get_order_history,
  query_returns: {
    method: "GET",
    buildPath: () => "/api/v1/returns",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.order_number && { order_number: filters.order_number }),
      ...(filters.status && { status: filters.status }),
      ...withLimit(filters),
    }),
  },
  query_support_tickets: {
    method: "GET",
    buildPath: () => "/api/v1/support/tickets",
    buildQuery: (filters) => ({
      ...(filters.customer_number && { customer_number: filters.customer_number }),
      ...(filters.order_number && { order_number: filters.order_number }),
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...withLimit(filters),
    }),
  },
  get_loyalty_summary: EXACT_INTENT_MAP.get_loyalty_balance,
  get_return_detail: EXACT_INTENT_MAP.get_return_status,
  query_policy_documents: {
    method: "GET",
    buildPath: () => "/api/v1/policies",
    buildQuery: (filters) => ({
      ...(filters.policy_key && { policy_key: filters.policy_key }),
      ...(filters.search && { search: filters.search }),
      ...withLimit(filters),
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
