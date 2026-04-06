import { ragDb } from "./db.js";
import { createEmbedding } from "./embeddingsClient.js";

type EmbeddingStorageKind = "vector" | "jsonb";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function getEmbeddingStorageKind(): Promise<EmbeddingStorageKind> {
  const result = await ragDb.raw(`
    select data_type, udt_name
    from information_schema.columns
    where table_name = 'policy_chunks' and column_name = 'embedding'
    limit 1
  `);

  const row = result.rows?.[0] as { udt_name?: string } | undefined;
  return row?.udt_name === "vector" ? "vector" : "jsonb";
}

async function main() {
  const storageKind = await getEmbeddingStorageKind();
  const rows = await ragDb("policy_chunks")
    .select("id", "chunk_text")
    .whereNull("embedding")
    .orderBy("chunk_index", "asc");

  console.log(`[rag] Found ${rows.length} policy chunks without embeddings`);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] as { id: string; chunk_text: string };
    const embedding = await createEmbedding(row.chunk_text);

    if (storageKind === "vector") {
      const vectorLiteral = `[${embedding.join(",")}]`;
      await ragDb.raw("update policy_chunks set embedding = ?::vector where id = ?", [
        vectorLiteral,
        row.id,
      ]);
    } else {
      await ragDb("policy_chunks")
        .where({ id: row.id })
        .update({ embedding: JSON.stringify(embedding) });
    }

    console.log(`[rag] Embedded chunk ${index + 1}/${rows.length}: ${row.id}`);
    await sleep(200);
  }

  console.log("[rag] Embedding generation complete");
}

main()
  .catch((error) => {
    console.error("[rag] Embedding generation failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await ragDb.destroy();
  });
