import { unlink } from "node:fs/promises";
import { Router } from "express";
import { createMessage, listMessagesByOwnedSession } from "../db/repositories/messagesRepo.js";
import { listArtifactsByOwnedSession } from "../db/repositories/artifactsRepo.js";
import { createSession, deleteSession, getSessionById, listSessions, renameSession, setSessionClosed, touchSession } from "../db/repositories/sessionsRepo.js";
import { listTracesByOwnedSession } from "../db/repositories/tracesRepo.js";
import { asyncRoute, sendNotFound } from "./routeUtils.js";
import { createMessageSchema, createSessionSchema, renameSessionSchema } from "./schemas.js";

export const sessionsRouter = Router();

sessionsRouter.get("/", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const sessions = await listSessions(customerNumber);
  res.status(200).json({ items: sessions });
}));

sessionsRouter.post("/", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const payload = createSessionSchema.parse(req.body);
  const session = await createSession(payload.id, payload.title, customerNumber);
  res.status(201).json(session);
}));

sessionsRouter.get("/:sessionId/messages", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, customerNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }

  const [messages, traces] = await Promise.all([
    listMessagesByOwnedSession(sessionId, customerNumber),
    listTracesByOwnedSession(sessionId, customerNumber),
  ]);

  res.status(200).json({
    session,
    messages,
    traces,
  });
}));

sessionsRouter.post("/:sessionId/messages", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, customerNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }
  if (session.closed_at) {
    res.status(409).json({ error: "session_closed" });
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
  await touchSession(sessionId, customerNumber);
  res.status(201).json(message);
}));

sessionsRouter.patch("/:sessionId", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, customerNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }
  const payload = renameSessionSchema.parse(req.body);
  let updated = session;
  if (payload.title !== undefined) {
    updated = (await renameSession(sessionId, payload.title, customerNumber)) ?? updated;
  }
  if (payload.is_closed !== undefined) {
    updated = (await setSessionClosed(sessionId, customerNumber, payload.is_closed)) ?? updated;
  }
  res.status(200).json(updated);
}));

sessionsRouter.delete("/:sessionId", asyncRoute(async (req, res) => {
  const customerNumber = req.customer!.customer_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, customerNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }

  const artifacts = await listArtifactsByOwnedSession(sessionId, customerNumber);
  const filePaths = artifacts.map((a) => a.file_path).filter((p): p is string => Boolean(p));

  await deleteSession(sessionId, customerNumber);
  await Promise.allSettled(filePaths.map((p) => unlink(p)));

  res.status(204).end();
}));
