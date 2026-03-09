import { z } from "zod";

export const chatRequestSchema = z.object({
  session_id: z.string().min(1),
  prompt: z.string().min(1),
  client_request_id: z.string().min(1).optional(),
  // When true: skip persisting the user turn and strip the prior assistant
  // answer from history so the LLM re-researches from scratch.
  is_retry: z.boolean().optional(),
  context: z
    .object({
      locale: z.string().optional(),
      timezone: z.string().optional(),
      modes: z
        .object({
          research: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const uiActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["table", "chart", "card", "button"]),
  title: z.string().min(1),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.record(z.string())).optional(),
  chartType: z.enum(["bar", "line", "pie"]).optional(),
  series: z
    .array(
      z.object({
        name: z.string(),
        data: z.array(z.object({ label: z.string(), value: z.number() })),
      }),
    )
    .optional(),
  description: z.string().optional(),
  buttonLabel: z.string().optional(),
  href: z.string().optional(),
});

export const citationSchema = z.object({
  label: z.string().min(1),
  source: z.string().min(1),
  uri: z.string().optional(),
  image: z.string().optional(),
});

export const toolTraceSchema = z.object({
  tool: z.string().min(1),
  status: z.enum(["success", "blocked", "error"]),
  latency_ms: z.number().int().nonnegative(),
  attempts: z.number().int().min(1),
});

export const userErrorSchema = z.object({
  reference_id: z.string().min(1),
  user_message: z.string().min(1),
  what_i_tried: z.string().min(1),
  next_options: z.array(z.string().min(1)).min(1).max(2),
});

export const chatResponseSchema = z.object({
  message_text: z.string().min(1),
  ui_actions: z.array(uiActionSchema),
  citations: z.array(citationSchema),
  tool_trace: z.array(toolTraceSchema),
  errors: z.array(userErrorSchema),
  summary: z.string().optional(),
  follow_up: z.string().optional(),
  show_sources: z.boolean().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolTrace = z.infer<typeof toolTraceSchema>;
