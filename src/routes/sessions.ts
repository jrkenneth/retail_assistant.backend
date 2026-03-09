import { Router } from "express";
import { z } from "zod";
import { createMessage, listMessagesBySession } from "../db/repositories/messagesRepo.js";
import { createSession, deleteSession, getSessionById, listSessions, renameSession, touchSession } from "../db/repositories/sessionsRepo.js";
import { listTracesBySession } from "../db/repositories/tracesRepo.js";

const createSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
});

const createMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  message_text: z.string().min(1),
  payload_json: z.record(z.unknown()).optional(),
});

export const sessionsRouter = Router();

sessionsRouter.get("/", async (_req, res, next) => {
  try {
    const sessions = await listSessions();
    res.status(200).json({ items: sessions });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/", async (req, res, next) => {
  try {
    const payload = createSessionSchema.parse(req.body);
    const session = await createSession(payload.id, payload.title);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get("/:sessionId/messages", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const [messages, traces] = await Promise.all([
      listMessagesBySession(sessionId),
      listTracesBySession(sessionId),
    ]);

    res.status(200).json({
      session,
      messages,
      traces,
    });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/:sessionId/messages", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    const payload = createMessageSchema.parse(req.body);
    const message = await createMessage({
      id: payload.id,
      sessionId,
      role: payload.role,
      messageText: payload.message_text,
      payloadJson: payload.payload_json,
    });
    await touchSession(sessionId);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

const renameSessionSchema = z.object({
  title: z.string().min(1).max(120),
});

sessionsRouter.patch("/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    const payload = renameSessionSchema.parse(req.body);
    const updated = await renameSession(sessionId, payload.title);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.delete("/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await getSessionById(sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    await deleteSession(sessionId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

