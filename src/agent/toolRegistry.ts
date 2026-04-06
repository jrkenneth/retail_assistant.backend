import type { AuthenticatedUser } from "../auth/types.js";
import { queryPolicyClient } from "../tools/queryPolicyTool.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { executeQueryClient } from "../tools/executeQueryTool.js";
import { searchClient } from "../tools/searchClient.js";
import type { AgentToolInput } from "./types.js";
import type { ModeOptions } from "./systemPrompt.js";
import type { SpecialistSkillName } from "./skillRegistry.js";

export function createToolRegistry(_user: AuthenticatedUser) {
  return {
    search_api: searchClient,
    query_policy: queryPolicyClient,
    execute_query: executeQueryClient,
  };
}

export type ToolName = keyof ReturnType<typeof createToolRegistry>;
export type ToolExecutor = (
  input: AgentToolInput,
  context?: ToolContext,
) => Promise<ToolResult<Record<string, unknown>>>;
const BASE_TOOLS: ToolName[] = ["execute_query"];
const RESEARCH_MODE_TOOLS: ToolName[] = ["search_api"];

export type ToolPlannerExample = {
  user_request: string;
  tool_input: AgentToolInput;
};

export type ToolPlannerGuide = {
  valid_intents?: string[];
  intent_aliases?: Record<string, string>;
  examples: ToolPlannerExample[];
};

export const toolDescriptions: Record<ToolName, string> = {
  search_api: "Searches external/public sources and returns high-level hits.",
  query_policy:
    "Retrieves the most relevant Velora policy chunks for grounded policy answers.",
  execute_query:
    "Executes structured queries against Velora retail data with server-side customer scope enforcement. Supported domains: commerce and rbac.",
};

export const toolPlannerGuides: Partial<Record<ToolName, ToolPlannerGuide>> = {
  search_api: {
    examples: [
      {
        user_request: "Find recent ecommerce returns benchmark data",
        tool_input: "ecommerce returns benchmark latest",
      },
    ],
  },
  query_policy: {
    examples: [
      {
        user_request: "What is your refund policy?",
        tool_input: {
          query: "Velora refund policy return window original packaging refund to original payment method",
          top_k: 3,
        },
      },
    ],
  },
  execute_query: {
    valid_intents: [
      "get_customer_profile",
      "query_products",
      "get_product_detail",
      "query_orders",
      "get_order_detail",
      "query_returns",
      "get_return_detail",
      "query_support_tickets",
      "get_support_ticket",
      "create_support_ticket",
      "get_loyalty_summary",
      "query_policy_documents",
      "get_policy_document",
      "health_check",
      "create_access_request",
    ],
    examples: [
      {
        user_request: "Track my order ZX123456789",
        tool_input: {
          domain: "commerce",
          intent: "query_orders",
          params: {},
          filters: { tracking_number: "ZX123456789", limit: 20 },
        },
      },
      {
        user_request: "Show me the Premium Wireless Headphones Model X",
        tool_input: {
          domain: "commerce",
          intent: "query_products",
          params: {},
          filters: { search: "Premium Wireless Headphones Model X", limit: 20 },
        },
      },
      {
        user_request: "What is Velora's returns policy?",
        tool_input: {
          domain: "commerce",
          intent: "get_policy_document",
          params: { policy_key: "returns_policy" },
          filters: {},
        },
      },
      {
        user_request: "Escalate this delayed delivery to support",
        tool_input: {
          domain: "commerce",
          intent: "create_support_ticket",
          params: {
            order_number: "RT-99283",
            subject: "Delayed delivery investigation",
            description: "Customer reported delivered status without receiving the parcel.",
            priority: "high",
          },
          filters: {},
        },
      },
    ],
  },
};

export const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "search_api",
      description:
        "Search external and public web sources for current, factual, or real-time information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A specific, concrete search query - never a placeholder or template.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_policy",
      description:
        "Retrieve policy text relevant to a customer policy question. Use this instead of general knowledge for returns, shipping, warranty, privacy, loyalty, payment, or prohibited-items policy questions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A policy-focused natural-language query.",
          },
          top_k: {
            type: "number",
            description: "How many relevant chunks to retrieve.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "execute_query",
      description:
        "Execute a query against an external Velora retail data domain. Supported domains: commerce and rbac.",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            enum: ["commerce", "rbac"],
            description: "The data domain to query.",
          },
          intent: {
            type: "string",
            description: "The query intent; must match a valid intent for the specified domain.",
          },
          params: {
            type: "object",
            description: "Path-level parameters such as order_number, sku, or policy_key.",
            additionalProperties: true,
          },
          filters: {
            type: "object",
            description: "Query-level filters such as tracking_number, status, search, category, limit, and page.",
            additionalProperties: true,
          },
        },
        required: ["domain", "intent"],
      },
    },
  },
] as const;

export const skillToolAccess: Partial<Record<SpecialistSkillName, ToolName[]>> = {
  product_enquiry_skill: ["execute_query"],
  order_management_skill: ["execute_query"],
  returns_skill: ["execute_query"],
  loyalty_skill: ["execute_query"],
  policy_rag_skill: ["query_policy", "execute_query"],
  escalation_skill: ["execute_query"],
  governance_skill: [],
};

export function resolveAllowedTools(modes: ModeOptions): ToolName[] {
  return modes.research ? [...BASE_TOOLS, ...RESEARCH_MODE_TOOLS] : BASE_TOOLS;
}
