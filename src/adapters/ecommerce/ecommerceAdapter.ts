import axios, { AxiosError, type AxiosInstance } from "axios";
import { env } from "../../config.js";
import { ECOMMERCE_INTENT_MAP } from "./intentMap.js";

type AdapterResult = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCustomerStatusPayload(payload: AdapterResult): AdapterResult {
  const data = isPlainObject(payload.data) ? payload.data : null;

  if (!data) {
    return payload;
  }

  return {
    data: {
      customer_id: typeof data.customer_id === "string" ? data.customer_id : "",
      account_status: typeof data.account_status === "string" ? data.account_status : "closed",
      loyalty_points: Number(data.loyalty_points ?? 0),
      email: typeof data.email === "string" ? data.email : "",
      first_name: typeof data.first_name === "string" ? data.first_name : "",
      last_name: typeof data.last_name === "string" ? data.last_name : "",
      full_name: typeof data.full_name === "string" ? data.full_name : "",
      customer_number: typeof data.customer_number === "string" ? data.customer_number : "",
    },
  };
}

export class EcommerceAdapter {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.ECOMMERCE_API_URL ?? "http://localhost:4001",
      headers: {
        "VELORA_API_KEY": env.ECOMMERCE_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  async execute(
    intent: string,
    params: Record<string, any> = {},
    filters: Record<string, any> = {},
  ): Promise<AdapterResult> {
    const mapping = ECOMMERCE_INTENT_MAP[intent];
    if (!mapping) {
      const validIntents = Object.keys(ECOMMERCE_INTENT_MAP).join(", ");
      throw new Error(`Ecommerce API: unknown intent "${intent}". Valid intents: ${validIntents}`);
    }

    const path = mapping.buildPath(params);
    const query = mapping.buildQuery(filters);
    const body = mapping.buildBody?.(params);

    try {
      const response = await this.client.request<unknown>({
        method: mapping.method,
        url: path,
        params: query,
        data: body,
      });

      if (!isPlainObject(response.data)) {
        return {
          data: null,
          meta: null,
          parse_error: true,
          error: "invalid_response_body",
        };
      }

      if (intent === "validate_customer_status") {
        return sanitizeCustomerStatusPayload(response.data);
      }

      return response.data;
    } catch (error) {
      return this.handleError(error, intent, path);
    }
  }

  private handleError(err: unknown, intent: string, path: string): AdapterResult {
    const axiosError = err as AxiosError<{ message?: string }>;
    const status = axiosError.response?.status;
    const message =
      axiosError.response?.data?.message ||
      axiosError.message ||
      "An unexpected error occurred";

    if (status === 401 && intent === "authenticate_customer") {
      throw new Error("Ecommerce API: invalid username or password.");
    }

    if (status === 401) {
      throw new Error("Ecommerce API: authentication failed. Check ECOMMERCE_API_KEY.");
    }

    if (status === 404) {
      return { data: null, meta: null, not_found: true };
    }

    if (status === 422) {
      throw new Error(`Ecommerce API: invalid filter - ${message}`);
    }

    if (status === 400) {
      throw new Error(`Ecommerce API: bad request - ${message}`);
    }

    if (typeof status === "number" && status >= 500) {
      throw new Error(`Ecommerce API: server error on ${path} - ${message}`);
    }

    if (axiosError.code === "ECONNABORTED") {
      throw new Error("Ecommerce API: request timed out. The retail service may be unavailable.");
    }

    if (axiosError.code === "ECONNREFUSED") {
      throw new Error("Ecommerce API: connection refused. Is the ecommerce demo backend running on port 4001?");
    }

    throw new Error(`Ecommerce API: unexpected error on intent "${intent}" - ${message}`);
  }
}

export const ecommerceAdapter = new EcommerceAdapter();
