import { db } from "../client.js";

type SessionRow = {
  id: string;
  customer_number: string | null;
  title: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSessions(customerNumber: string, limit = 50): Promise<SessionRow[]> {
  return db<SessionRow>("chat_sessions")
    .select("*")
    .where({ customer_number: customerNumber })
    .orderBy("updated_at", "desc")
    .limit(limit);
}

export async function createSession(id: string, title: string, customerNumber: string): Promise<SessionRow> {
  const [row] = await db<SessionRow>("chat_sessions")
    .insert({ id, title, customer_number: customerNumber })
    .returning("*");
  return row;
}

export async function touchSession(id: string, customerNumber: string): Promise<void> {
  await db("chat_sessions")
    .where({ id, customer_number: customerNumber })
    .update({ updated_at: db.fn.now() });
}

export async function getSessionById(id: string, customerNumber: string): Promise<SessionRow | undefined> {
  return db<SessionRow>("chat_sessions").where({ id, customer_number: customerNumber }).first();
}

export async function deleteSession(id: string, customerNumber: string): Promise<void> {
  await db("chat_sessions").where({ id, customer_number: customerNumber }).delete();
}

export async function renameSession(id: string, title: string, customerNumber: string): Promise<SessionRow | undefined> {
  const [row] = await db<SessionRow>("chat_sessions")
    .where({ id, customer_number: customerNumber })
    .update({ title, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function setSessionClosed(
  id: string,
  customerNumber: string,
  isClosed: boolean,
): Promise<SessionRow | undefined> {
  const [row] = await db<SessionRow>("chat_sessions")
    .where({ id, customer_number: customerNumber })
    .update({
      closed_at: isClosed ? db.fn.now() : null,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return row;
}
