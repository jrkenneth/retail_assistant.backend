import { unlink } from "node:fs/promises";
import { Router } from "express";
import { createMessage, listMessagesByOwnedSession } from "../db/repositories/messagesRepo.js";
import { listArtifactsByOwnedSession } from "../db/repositories/artifactsRepo.js";
import { createSession, deleteSession, getSessionById, listSessions, renameSession, touchSession } from "../db/repositories/sessionsRepo.js";
import { listTracesByOwnedSession } from "../db/repositories/tracesRepo.js";
import { asyncRoute, sendNotFound } from "./routeUtils.js";
import { createMessageSchema, createSessionSchema, renameSessionSchema } from "./schemas.js";

export const sessionsRouter = Router();

sessionsRouter.get("/", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const sessions = await listSessions(employeeNumber);
  res.status(200).json({ items: sessions });
}));

sessionsRouter.post("/", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const payload = createSessionSchema.parse(req.body);
  const session = await createSession(payload.id, payload.title, employeeNumber);
  res.status(201).json(session);
}));

sessionsRouter.get("/:sessionId/messages", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, employeeNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }

  const [messages, traces] = await Promise.all([
    listMessagesByOwnedSession(sessionId, employeeNumber),
    listTracesByOwnedSession(sessionId, employeeNumber),
  ]);

  res.status(200).json({
    session,
    messages,
    traces,
  });
}));

sessionsRouter.post("/:sessionId/messages", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, employeeNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
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
  await touchSession(sessionId, employeeNumber);
  res.status(201).json(message);
}));

sessionsRouter.patch("/:sessionId", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, employeeNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }
  const payload = renameSessionSchema.parse(req.body);
  const updated = await renameSession(sessionId, payload.title, employeeNumber);
  res.status(200).json(updated);
}));

sessionsRouter.delete("/:sessionId", asyncRoute(async (req, res) => {
  const employeeNumber = req.user!.employee_number;
  const { sessionId } = req.params;
  const session = await getSessionById(sessionId, employeeNumber);
  if (!session) {
    sendNotFound(res, "session_not_found");
    return;
  }

  const artifacts = await listArtifactsByOwnedSession(sessionId, employeeNumber);
  const filePaths = artifacts.map((a) => a.file_path).filter((p): p is string => Boolean(p));

  await deleteSession(sessionId, employeeNumber);
  await Promise.allSettled(filePaths.map((p) => unlink(p)));

  res.status(204).end();
}));
