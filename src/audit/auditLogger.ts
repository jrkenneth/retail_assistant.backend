import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";

export type AuditEvent = {
  customer_id: string;
  customer_email: string;
  event_type: "access_denied" | "escalation_triggered" | "refusal_triggered" | "scope_violation";
  domain: string;
  intent: string;
  params_snapshot: Record<string, unknown>;
  reason: string;
  ip_address: string | null;
};

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await db("audit_log").insert({
      id: randomUUID(),
      customer_id: event.customer_id,
      customer_email: event.customer_email,
      event_type: event.event_type,
      domain: event.domain,
      intent: event.intent,
      params_snapshot: event.params_snapshot,
      reason: event.reason,
      ip_address: event.ip_address,
    });
  } catch (error) {
    console.error("audit_log_failed", error);
  }
}
