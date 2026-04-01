import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";

export type AuditEvent = {
  employee_number: string;
  full_name: string;
  role: string;
  event_type: "access_denied" | "scope_violation";
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
      employee_number: event.employee_number,
      full_name: event.full_name,
      role: event.role,
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
