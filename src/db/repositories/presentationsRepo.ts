import { db } from "../client.js";

type PresentationRow = {
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  status: string;
  html_content: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type CreatePresentationInput = {
  id: string;
  sessionId: string;
  title: string;
  prompt: string;
  status?: "generated" | "failed" | "exported";
  htmlContent: string;
  metadataJson?: Record<string, unknown>;
};

export async function createPresentation(input: CreatePresentationInput): Promise<PresentationRow> {
  const [row] = await db<PresentationRow>("presentations")
    .insert({
      id: input.id,
      session_id: input.sessionId,
      title: input.title,
      prompt: input.prompt,
      status: input.status ?? "generated",
      html_content: input.htmlContent,
      metadata_json: input.metadataJson ?? {},
    })
    .returning("*");
  return row;
}

export async function getPresentationById(id: string): Promise<PresentationRow | undefined> {
  return db<PresentationRow>("presentations").where({ id }).first();
}

export async function listPresentationsBySession(
  sessionId: string,
  limit = 100,
): Promise<PresentationRow[]> {
  return db<PresentationRow>("presentations")
    .select("*")
    .where({ session_id: sessionId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function listPresentations(limit = 200): Promise<PresentationRow[]> {
  return db<PresentationRow>("presentations")
    .select("*")
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function markPresentationExported(id: string): Promise<void> {
  await db("presentations").where({ id }).update({
    status: "exported",
    updated_at: db.fn.now(),
  });
}
