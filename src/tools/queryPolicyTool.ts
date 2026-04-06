import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { retrieveRelevantChunks } from "../rag/retrievePolicy.js";
import type { ToolContext, ToolResult } from "./types.js";

const queryPolicySchema = z.object({
  query: z.string().min(1),
  top_k: z.coerce.number().int().min(1).max(10).optional().default(3),
});

function formatPolicyChunks(
  chunks: Array<{ policy_title: string; chunk_text: string }>,
): string {
  return chunks
    .map((chunk) => `[Policy: ${chunk.policy_title}]\n${chunk.chunk_text}`)
    .join("\n\n");
}

export const queryPolicyTool = new DynamicStructuredTool({
  name: "query_policy",
  description: "Retrieve the most relevant Velora policy chunks for a customer-policy question.",
  schema: queryPolicySchema,
  func: async ({ query, top_k }) => {
    const chunks = await retrieveRelevantChunks(query, top_k);
    return JSON.stringify({
      query,
      formatted_text: formatPolicyChunks(chunks),
      chunks,
      max_similarity: chunks[0]?.similarity ?? 0,
    });
  },
});

export async function queryPolicyClient(
  input: unknown,
  _context?: ToolContext,
): Promise<ToolResult<Record<string, unknown>>> {
  const payload = queryPolicySchema.parse(input);
  const chunks = await retrieveRelevantChunks(payload.query, payload.top_k);
  const formattedText = formatPolicyChunks(chunks);

  return {
    tool: "query_policy",
    version: "v1",
    data: {
      ok: true,
      kind: "policy",
      payload: {
        query: payload.query,
        formatted_text: formattedText,
        chunks,
        max_similarity: chunks[0]?.similarity ?? 0,
      },
      summary:
        chunks.length > 0
          ? `Retrieved ${chunks.length} relevant policy chunks.`
          : "No relevant policy chunks were found.",
    },
    citation: {
      label: "domain:policy",
      source: chunks[0]?.policy_title ?? "Velora Policy Library",
    },
  };
}
