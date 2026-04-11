import { z } from "zod";

export const createSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
});

export const createMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  message_text: z.string().min(1),
  payload_json: z.record(z.unknown()).optional(),
});

export const renameSessionSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  is_closed: z.boolean().optional(),
}).refine((payload) => payload.title !== undefined || payload.is_closed !== undefined, {
  message: "Either title or is_closed must be provided.",
});

export const createAccessRequestSchema = z.object({
  resource_requested: z.string().min(1).max(240),
  justification: z.string().min(1).max(1000),
});
