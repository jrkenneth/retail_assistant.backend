type LogLevel = "info" | "warn" | "error";

export function makeReferenceId() {
  return `REF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function logEvent(
  level: LogLevel,
  event: string,
  correlationId: string,
  details: Record<string, unknown>,
) {
  const payload = {
    level,
    event,
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    ...details,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function redactInputs(input: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("password")) {
      redacted[key] = "[REDACTED]";
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
