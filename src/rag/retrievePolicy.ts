import { ragDb } from "./db.js";
import { createEmbedding } from "./embeddingsClient.js";

export type PolicyChunk = {
  id: string;
  policy_document_id: string;
  policy_key: string;
  policy_title: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
};

type EmbeddingStorageKind = "vector" | "jsonb";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return clampScore(dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)));
}

function parseEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is number => typeof item === "number");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is number => typeof item === "number");
      }
    } catch {
      const stripped = value.trim().replace(/^\[/, "").replace(/\]$/, "");
      if (!stripped) {
        return [];
      }
      return stripped
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((item) => Number.isFinite(item));
    }
  }

  return [];
}

async function getEmbeddingStorageKind(): Promise<EmbeddingStorageKind> {
  const result = await ragDb.raw(`
    select data_type, udt_name
    from information_schema.columns
    where table_name = 'policy_chunks' and column_name = 'embedding'
    limit 1
  `);

  const row = result.rows?.[0] as { data_type?: string; udt_name?: string } | undefined;
  if (row?.udt_name === "vector") {
    return "vector";
  }

  return "jsonb";
}

export async function retrieveRelevantChunks(query: string, topK = 3): Promise<PolicyChunk[]> {
  const queryEmbedding = await createEmbedding(query);
  const storageKind = await getEmbeddingStorageKind();

  if (storageKind === "vector") {
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const result = await ragDb.raw(
      `
        select
          pc.id,
          pc.policy_document_id,
          pd.policy_key,
          pd.title as policy_title,
          pc.chunk_index,
          pc.chunk_text,
          greatest(0, least(1, 1 - (pc.embedding <=> ?::vector))) as similarity
        from policy_chunks pc
        inner join policy_documents pd on pd.id = pc.policy_document_id
        where pc.embedding is not null
        order by pc.embedding <=> ?::vector
        limit ?
      `,
      [vectorLiteral, vectorLiteral, topK],
    );

    return (result.rows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      policy_document_id: String(row.policy_document_id),
      policy_key: String(row.policy_key),
      policy_title: String(row.policy_title),
      chunk_index: Number(row.chunk_index),
      chunk_text: String(row.chunk_text),
      similarity: clampScore(Number(row.similarity ?? 0)),
    }));
  }

  const rows = await ragDb("policy_chunks as pc")
    .innerJoin("policy_documents as pd", "pd.id", "pc.policy_document_id")
    .select(
      "pc.id",
      "pc.policy_document_id",
      "pd.policy_key",
      "pd.title as policy_title",
      "pc.chunk_index",
      "pc.chunk_text",
      "pc.embedding",
    )
    .whereNotNull("pc.embedding");

  return rows
    .map((row) => ({
      id: String(row.id),
      policy_document_id: String(row.policy_document_id),
      policy_key: String(row.policy_key),
      policy_title: String(row.policy_title),
      chunk_index: Number(row.chunk_index),
      chunk_text: String(row.chunk_text),
      similarity: cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
