import { db } from "../client.js";

type TraceRow = {
  id: string;
  session_id: string;
  reference_id: string;
  tool: string;
  status: string;
  latency_ms: number;
  attempts: number;
  error_code: string | null;
  created_at: string;
};

type CreateTraceInput = {
  id: string;
  sessionId: string;
  referenceId: string;
  tool: string;
  status: string;
  latencyMs: number;
  attempts: number;
  errorCode?: string;
};

export async function createTrace(input: CreateTraceInput): Promise<TraceRow> {
  const [row] = await db<TraceRow>("request_traces")
    .insert({
      id: input.id,
      session_id: input.sessionId,
      reference_id: input.referenceId,
      tool: input.tool,
      status: input.status,
      latency_ms: input.latencyMs,
      attempts: input.attempts,
      error_code: input.errorCode ?? null,
    })
    .returning("*");
  return row;
}

export async function listTracesBySession(sessionId: string, limit = 200): Promise<TraceRow[]> {
  return db<TraceRow>("request_traces")
    .select("*")
    .where({ session_id: sessionId })
    .orderBy("created_at", "asc")
    .limit(limit);
}

export async function listTracesByOwnedSession(
  sessionId: string,
  customerNumber: string,
  limit = 200,
): Promise<TraceRow[]> {
  return db<TraceRow>("request_traces")
    .innerJoin("chat_sessions", "request_traces.session_id", "chat_sessions.id")
    .where("request_traces.session_id", sessionId)
    .andWhere("chat_sessions.customer_number", customerNumber)
    .select("request_traces.*")
    .orderBy("request_traces.created_at", "asc")
    .limit(limit);
}
