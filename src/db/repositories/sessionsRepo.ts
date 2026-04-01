import { db } from "../client.js";

type SessionRow = {
  id: string;
  employee_number: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listSessions(employeeNumber: string, limit = 50): Promise<SessionRow[]> {
  return db<SessionRow>("chat_sessions")
    .select("*")
    .where({ employee_number: employeeNumber })
    .orderBy("updated_at", "desc")
    .limit(limit);
}

export async function createSession(id: string, title: string, employeeNumber: string): Promise<SessionRow> {
  const [row] = await db<SessionRow>("chat_sessions")
    .insert({ id, title, employee_number: employeeNumber })
    .returning("*");
  return row;
}

export async function touchSession(id: string, employeeNumber: string): Promise<void> {
  await db("chat_sessions")
    .where({ id, employee_number: employeeNumber })
    .update({ updated_at: db.fn.now() });
}

export async function getSessionById(id: string, employeeNumber: string): Promise<SessionRow | undefined> {
  return db<SessionRow>("chat_sessions").where({ id, employee_number: employeeNumber }).first();
}

export async function deleteSession(id: string, employeeNumber: string): Promise<void> {
  await db("chat_sessions").where({ id, employee_number: employeeNumber }).delete();
}

export async function renameSession(id: string, title: string, employeeNumber: string): Promise<SessionRow | undefined> {
  const [row] = await db<SessionRow>("chat_sessions")
    .where({ id, employee_number: employeeNumber })
    .update({ title, updated_at: db.fn.now() })
    .returning("*");
  return row;
}
