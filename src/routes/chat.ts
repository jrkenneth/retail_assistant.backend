import { Router } from "express";
import { ZodError } from "zod";
import { runAgent } from "../agent/agentRunner.js";
import { chatRequestSchema, chatResponseSchema, type ChatResponse } from "../chat/contracts.js";
import { logEvent, makeReferenceId } from "../chat/logger.js";
import { createMessage, listMessagesBySession } from "../db/repositories/messagesRepo.js";
import { createSession, getSessionById, touchSession } from "../db/repositories/sessionsRepo.js";
import { createTrace } from "../db/repositories/tracesRepo.js";

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const chatRouter = Router();

function mapValidationError(correlationId: string): ChatResponse {
  return {
    message_text: `I couldn't complete the request because input format was invalid. I tried to validate request schema. You can fix the request body and retry. Ref: ${correlationId}.`,
    ui_actions: [],
    citations: [],
    tool_trace: [],
    errors: [
      {
        reference_id: correlationId,
        user_message: "Request format is invalid.",
        what_i_tried: "I validated the request against the chat schema.",
        next_options: ["Fix request payload", "Retry with valid fields"],
      },
    ],
  };
}

function mapInternalError(correlationId: string): ChatResponse {
  return {
    message_text: `I couldn't complete the request because an internal error occurred. I tried executing the request through orchestrator flow. You can retry now or try a simplified prompt. Ref: ${correlationId}.`,
    ui_actions: [],
    citations: [],
    tool_trace: [],
    errors: [
      {
        reference_id: correlationId,
        user_message: "Internal execution failed.",
        what_i_tried: "I ran the orchestrator flow and captured diagnostics.",
        next_options: ["Retry now", "Try a simplified request"],
      },
    ],
  };
}

async function processChatRequest(
  rawBody: unknown,
  correlationId: string,
  onStatus?: (phase: string, message: string) => void,
): Promise<ChatResponse> {
  const request = chatRequestSchema.parse(rawBody);

  logEvent("info", "chat.request.received", correlationId, {
    client_request_id: request.client_request_id ?? null,
    session_id: request.session_id,
    prompt_length: request.prompt.length,
  });

  const existingSession = await getSessionById(request.session_id);
  if (!existingSession) {
    await createSession(request.session_id, "New Chat");
  }
  const historyRows = await listMessagesBySession(request.session_id, 12);
  let historyMapped = historyRows.map((row) => ({
    role: row.role,
    text: row.message_text,
  }));

  if (request.is_retry) {
    // Strip the last assistant turn so the LLM re-researches instead of
    // synthesising from its earlier cached answer.
    const lastAssistantIdx = [...historyMapped].map((r, i) => ({ r, i })).reverse()
      .find(({ r }) => r.role === "assistant")?.i;
    if (lastAssistantIdx !== undefined) {
      historyMapped = historyMapped.filter((_, i) => i !== lastAssistantIdx);
    }
    // User turn is already in the DB from the original request — skip re-persisting.
  } else {
    await createMessage({
      id: makeId("msg"),
      sessionId: request.session_id,
      role: "user",
      messageText: request.prompt,
      payloadJson: {},
    });
  }

  const history = historyMapped;

  const responsePayload = await runAgent(request, correlationId, history, onStatus);
  const response = chatResponseSchema.parse(responsePayload);

  await Promise.all([
    createMessage({
      id: makeId("msg"),
      sessionId: request.session_id,
      role: "assistant",
      messageText: response.message_text,
      payloadJson: {
        ui_actions: response.ui_actions,
        citations: response.citations,
        errors: response.errors,
        summary: response.summary,
        follow_up: response.follow_up,
        show_sources: response.show_sources,
      },
    }),
    ...response.tool_trace.map((trace) =>
      createTrace({
        id: makeId("trace"),
        sessionId: request.session_id,
        referenceId: correlationId,
        tool: trace.tool,
        status: trace.status,
        latencyMs: trace.latency_ms,
        attempts: trace.attempts,
      }),
    ),
    touchSession(request.session_id),
  ]);

  logEvent("info", "chat.request.completed", correlationId, {
    tool_trace_count: response.tool_trace.length,
    action_count: response.ui_actions.length,
    error_count: response.errors.length,
  });

  return response;
}

chatRouter.post("/", async (req, res) => {
  const correlationId = req.header("x-correlation-id") ?? makeReferenceId();
  try {
    const response = await processChatRequest(req.body, correlationId);
    res.setHeader("x-reference-id", correlationId);
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      logEvent("warn", "chat.request.invalid_schema", correlationId, {
        issues: error.issues,
      });
      res.status(400).json(mapValidationError(correlationId));
      return;
    }
    logEvent("error", "chat.request.crashed", correlationId, {
      error_message: error instanceof Error ? error.message : "unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json(mapInternalError(correlationId));
  }
});

chatRouter.post("/stream", async (req, res) => {
  const correlationId = req.header("x-correlation-id") ?? makeReferenceId();
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const writeEvent = (event: unknown) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  const onStatus = (phase: string, message: string) => {
    writeEvent({ type: "status", phase, message });
  };

  try {
    const response = await processChatRequest(req.body, correlationId, onStatus);
    const words = response.message_text.split(" ");
    for (let i = 0; i < words.length; i++) {
      const token = i === words.length - 1 ? words[i] : `${words[i]} `;
      writeEvent({ type: "token", token });
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    }

    writeEvent({ type: "result", payload: response });
    res.end();
  } catch (error) {
    if (error instanceof ZodError) {
      logEvent("warn", "chat.stream.invalid_schema", correlationId, {
        issues: error.issues,
      });
      writeEvent({ type: "error", payload: mapValidationError(correlationId) });
      res.end();
      return;
    }
    logEvent("error", "chat.stream.crashed", correlationId, {
      error_message: error instanceof Error ? error.message : "unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    writeEvent({ type: "error", payload: mapInternalError(correlationId) });
    res.end();
  }
});
