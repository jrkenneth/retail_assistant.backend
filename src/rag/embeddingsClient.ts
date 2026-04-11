import { env } from "../config.js";

const MAX_EMBEDDING_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 12000];

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  return trimmed;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric * 1000;
  }

  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

export async function createEmbedding(input: string): Promise<number[]> {
  if (!env.EMBEDDING_API_KEY) {
    throw new Error("embedding_api_key_missing");
  }

  for (let attempt = 1; attempt <= MAX_EMBEDDING_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${normalizeBaseUrl(env.EMBEDDING_BASE_URL)}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.EMBEDDING_MODEL,
        input,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      const embedding = payload.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== "number")) {
        throw new Error("embedding_response_invalid");
      }

      return embedding;
    }

    if (response.status === 429 && attempt < MAX_EMBEDDING_ATTEMPTS) {
      const retryAfterMs =
        parseRetryAfterMs(response.headers.get("retry-after")) ??
        DEFAULT_RETRY_DELAYS_MS[Math.min(attempt - 1, DEFAULT_RETRY_DELAYS_MS.length - 1)];
      console.warn(`[rag] Embedding rate-limited on attempt ${attempt}. Retrying in ${retryAfterMs}ms...`);
      await sleep(retryAfterMs);
      continue;
    }

    throw new Error(`embedding_request_failed_${response.status}`);
  }

  throw new Error("embedding_request_failed_unknown");
}
