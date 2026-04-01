import type { AuthenticatedUser } from "../auth/types.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { executeQueryClient } from "../tools/executeQueryTool.js";
import { searchClient } from "../tools/searchClient.js";
import type { AgentToolInput } from "./types.js";
import type { SkillName } from "./skillRegistry.js";
import type { ModeOptions } from "./systemPrompt.js";

export function createToolRegistry(_user: AuthenticatedUser) {
  return {
    search_api: searchClient,
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
  execute_query:
    "Executes structured queries against supported business data domains with server-side RBAC enforcement. Supported domains: hr, rbac.",
};

export const toolPlannerGuides: Partial<Record<ToolName, ToolPlannerGuide>> = {
  search_api: {
    examples: [
      {
        user_request: "Find recent Basel III updates",
        tool_input: "Basel III latest updates",
      },
    ],
  },
  execute_query: {
    valid_intents: [
      "query_employees",
      "get_employee_profile",
      "get_employee_summary",
      "query_leave",
      "get_leave_balance",
      "query_payroll",
      "get_employee_payroll",
      "query_performance",
      "get_employee_performance",
      "get_employment_history",
      "health_check",
      "create_access_request",
    ],
    examples: [
      {
        user_request: "Show me employee EMP-007",
        tool_input: {
          domain: "hr",
          intent: "get_employee_profile",
          params: { employee_number: "EMP-007" },
          filters: {},
        },
      },
      {
        user_request: "Show me employee Vikash Foolchand",
        tool_input: {
          domain: "hr",
          intent: "query_employees",
          params: {},
          filters: { full_name: "Vikash Foolchand", limit: 50 },
        },
      },
      {
        user_request: "Show me payroll for the Finance department",
        tool_input: {
          domain: "hr",
          intent: "query_payroll",
          params: {},
          filters: { department_name: "Finance", limit: 50 },
        },
      },
      {
        user_request: "Raise an access request for payroll details",
        tool_input: {
          domain: "rbac",
          intent: "create_access_request",
          params: {
            requested_by: "EMP-011",
            resource_requested: "Payroll details for Finance department",
            justification: "Need access to support monthly finance review",
          },
          filters: {},
        },
      },
    ],
  },
};

// OpenAI function-calling schemas for native bindTools() integration.
// Keep in sync with toolRegistry keys and toolDescriptions.
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
      name: "execute_query",
      description:
        "Execute a query against an external data domain. Use this tool when you need to retrieve HR data from the Aletia platform. Supported domains: hr. Use the active routed HR guidance to determine the correct intent, params, and filters before calling this tool.",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            enum: ["hr", "rbac"],
            description: "The data domain to query.",
          },
          intent: {
            type: "string",
            description: "The query intent; must match a valid intent for the specified domain.",
          },
          params: {
            type: "object",
            description: "Path-level parameters such as employee_number.",
            additionalProperties: true,
          },
          filters: {
            type: "object",
            description: "Query-level filters such as department_name, status, department_id, date ranges, limit, and page.",
            additionalProperties: true,
          },
        },
        required: ["domain", "intent"],
      },
    },
  },
] as const;

export const skillToolAccess: Partial<Record<SkillName, ToolName[]>> = {
  web_research: ["search_api"],
  artefact_design: [],
  querydb: ["execute_query"],
};

export function resolveAllowedTools(modes: ModeOptions): ToolName[] {
  return modes.research ? [...BASE_TOOLS, ...RESEARCH_MODE_TOOLS] : BASE_TOOLS;
}
