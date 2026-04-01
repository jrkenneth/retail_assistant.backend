import { db } from "../client.js";
import type { ArtifactType } from "../../artifacts/types.js";

export type ArtifactRow = {
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  artifact_type: ArtifactType;
  status: string;
  content_json: Record<string, unknown> | null;
  html_preview: string | null;
  text_content: string | null;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type CreateArtifactInput = {
  id: string;
  sessionId: string;
  title: string;
  prompt: string;
  artifactType: ArtifactType;
  status?: "generated" | "failed" | "exported";
  contentJson?: Record<string, unknown> | null;
  htmlPreview?: string | null;
  textContent?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  metadataJson?: Record<string, unknown>;
};

export async function createArtifact(input: CreateArtifactInput): Promise<ArtifactRow> {
  const [row] = await db<ArtifactRow>("artifacts")
    .insert({
      id: input.id,
      session_id: input.sessionId,
      title: input.title,
      prompt: input.prompt,
      artifact_type: input.artifactType,
      status: input.status ?? "generated",
      content_json: input.contentJson ?? null,
      html_preview: input.htmlPreview ?? null,
      text_content: input.textContent ?? null,
      file_name: input.fileName ?? null,
      file_path: input.filePath ?? null,
      mime_type: input.mimeType ?? null,
      metadata_json: input.metadataJson ?? {},
    })
    .returning("*");
  return row;
}

export async function getArtifactById(id: string): Promise<ArtifactRow | undefined> {
  return db<ArtifactRow>("artifacts").where({ id }).first();
}

export async function listArtifacts(limit = 200): Promise<ArtifactRow[]> {
  return db<ArtifactRow>("artifacts")
    .select("*")
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function listArtifactsBySession(sessionId: string): Promise<Pick<ArtifactRow, "id" | "file_path">[]> {
  return db<ArtifactRow>("artifacts")
    .where({ session_id: sessionId })
    .select("id", "file_path");
}

export async function getOwnedArtifactById(
  id: string,
  employeeNumber: string,
): Promise<ArtifactRow | undefined> {
  return db<ArtifactRow>("artifacts")
    .innerJoin("chat_sessions", "artifacts.session_id", "chat_sessions.id")
    .where("artifacts.id", id)
    .andWhere("chat_sessions.employee_number", employeeNumber)
    .select("artifacts.*")
    .first();
}

export async function listOwnedArtifacts(
  employeeNumber: string,
  limit = 200,
): Promise<ArtifactRow[]> {
  return db<ArtifactRow>("artifacts")
    .innerJoin("chat_sessions", "artifacts.session_id", "chat_sessions.id")
    .where("chat_sessions.employee_number", employeeNumber)
    .select("artifacts.*")
    .orderBy("artifacts.created_at", "desc")
    .limit(limit);
}

export async function listArtifactsByOwnedSession(
  sessionId: string,
  employeeNumber: string,
): Promise<Pick<ArtifactRow, "id" | "file_path">[]> {
  return db<ArtifactRow>("artifacts")
    .innerJoin("chat_sessions", "artifacts.session_id", "chat_sessions.id")
    .where("artifacts.session_id", sessionId)
    .andWhere("chat_sessions.employee_number", employeeNumber)
    .select("artifacts.id", "artifacts.file_path");
}
