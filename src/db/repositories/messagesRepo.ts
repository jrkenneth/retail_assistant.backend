import { db } from "../client.js";

type MessageRole = "user" | "assistant";

type MessageRow = {
  id: string;
  session_id: string;
  role: MessageRole;
  message_text: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

type CreateMessageInput = {
  id: string;
  sessionId: string;
  role: MessageRole;
  messageText: string;
  payloadJson?: Record<string, unknown>;
};

export async function listMessagesBySession(sessionId: string, limit = 200): Promise<MessageRow[]> {
  return db<MessageRow>("chat_messages")
    .select("*")
    .where({ session_id: sessionId })
    .orderBy("created_at", "asc")
    .limit(limit);
}

export async function listMessagesByOwnedSession(
  sessionId: string,
  customerNumber: string,
  limit = 200,
): Promise<MessageRow[]> {
  return db<MessageRow>("chat_messages")
    .innerJoin("chat_sessions", "chat_messages.session_id", "chat_sessions.id")
    .where("chat_messages.session_id", sessionId)
    .andWhere("chat_sessions.customer_number", customerNumber)
    .select("chat_messages.*")
    .orderBy("chat_messages.created_at", "asc")
    .limit(limit);
}

export async function createMessage(input: CreateMessageInput): Promise<MessageRow> {
  const [row] = await db<MessageRow>("chat_messages")
    .insert({
      id: input.id,
      session_id: input.sessionId,
      role: input.role,
      message_text: input.messageText,
      payload_json: input.payloadJson ?? {},
    })
    .returning("*");
  return row;
}
