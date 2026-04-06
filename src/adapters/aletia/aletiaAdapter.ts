// Executes mapped HR intents against the Aletia REST API with consistent error handling.

import axios, { AxiosError, type AxiosInstance } from "axios";
import { env } from "../../config.js";
import { ALETIA_INTENT_MAP } from "./intentMap.js";

type AdapterResult = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeEmployeeStatusPayload(payload: AdapterResult): AdapterResult {
  const data = isPlainObject(payload.data) ? payload.data : null;

  if (!data) {
    return payload;
  }

  return {
    data: {
      is_active: data.status === "active",
      role: typeof data.job_title === "string" ? data.job_title : "",
      department: typeof data.department === "string" ? data.department : "",
      entity: typeof data.entity === "string" ? data.entity : "",
    },
  };
}

export class AletiaAdapter {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.ALETIA_API_URL ?? "http://localhost:4001",
      headers: {
        "VELORA_API_KEY": env.VELORA_API_KEY ?? "",
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
    const mapping = ALETIA_INTENT_MAP[intent];
    if (!mapping) {
      const validIntents = Object.keys(ALETIA_INTENT_MAP).join(", ");
      throw new Error(`Aletia API: unknown intent "${intent}". Valid intents: ${validIntents}`);
    }

    const path = mapping.buildPath(params);
    const query = mapping.buildQuery(filters);
    const body = mapping.buildBody?.(params);

    try {
      const response = await this.client.request<AdapterResult>({
        method: mapping.method,
        url: path,
        params: query,
        data: body,
      });
      if (intent === "validate_employee_status") {
        return sanitizeEmployeeStatusPayload(response.data);
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

    if (status === 401 && intent === "authenticate_user") {
      throw new Error("Aletia API: invalid username or password.");
    }

    if (status === 401) {
      throw new Error("Aletia API: authentication failed. Check VELORA_API_KEY.");
    }

    if (status === 404) {
      return { data: null, meta: null, not_found: true };
    }

    if (status === 422) {
      throw new Error(`Aletia API: invalid filter - ${message}`);
    }

    if (status === 400) {
      throw new Error(`Aletia API: bad request - ${message}`);
    }

    if (typeof status === "number" && status >= 500) {
      throw new Error(`Aletia API: server error on ${path} - ${message}`);
    }

    if (axiosError.code === "ECONNABORTED") {
      throw new Error("Aletia API: request timed out. HR service may be unavailable.");
    }

    if (axiosError.code === "ECONNREFUSED") {
      throw new Error("Aletia API: connection refused. Is Aletia running on port 4001?");
    }

    throw new Error(`Aletia API: unexpected error on intent "${intent}" - ${message}`);
  }
}

export const aletiaAdapter = new AletiaAdapter();
