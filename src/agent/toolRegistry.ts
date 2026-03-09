import { searchClient } from "../tools/searchClient.js";

export const toolRegistry = {
  search_api: searchClient,
};

export type ToolName = keyof typeof toolRegistry;

export const toolDescriptions: Record<ToolName, string> = {
  search_api: "Searches external/public sources and returns high-level hits.",
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
            description: "A specific, concrete search query — never a placeholder or template.",
          },
        },
        required: ["query"],
      },
    },
  },
] as const;
