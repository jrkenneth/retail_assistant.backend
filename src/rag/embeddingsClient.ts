import { env } from "../config.js";

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  return trimmed;
}

export async function createEmbedding(input: string): Promise<number[]> {
  if (!env.LLM_API_KEY) {
    throw new Error("embedding_api_key_missing");
  }

  const response = await fetch(`${normalizeBaseUrl(env.LLM_BASE_URL)}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.EMBEDDING_MODEL,
      input,
    }),
  });

  if (!response.ok) {
    throw new Error(`embedding_request_failed_${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== "number")) {
    throw new Error("embedding_response_invalid");
  }

  return embedding;
}
