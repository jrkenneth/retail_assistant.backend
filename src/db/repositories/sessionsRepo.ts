import { db } from "../client.js";

type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listSessions(limit = 50): Promise<SessionRow[]> {
  return db<SessionRow>("chat_sessions")
    .select("*")
    .orderBy("updated_at", "desc")
    .limit(limit);
}

export async function createSession(id: string, title: string): Promise<SessionRow> {
  const [row] = await db<SessionRow>("chat_sessions")
    .insert({ id, title })
    .returning("*");
  return row;
}

export async function touchSession(id: string): Promise<void> {
  await db("chat_sessions").where({ id }).update({ updated_at: db.fn.now() });
}

export async function getSessionById(id: string): Promise<SessionRow | undefined> {
  return db<SessionRow>("chat_sessions").where({ id }).first();
}

export async function deleteSession(id: string): Promise<void> {
  await db("chat_messages").where({ session_id: id }).delete();
  await db("chat_sessions").where({ id }).delete();
}

export async function renameSession(id: string, title: string): Promise<SessionRow | undefined> {
  const [row] = await db<SessionRow>("chat_sessions")
    .where({ id })
    .update({ title, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

