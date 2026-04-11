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
          thinking: z.boolean().optional(),
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

export const policyCitationSchema = z.object({
  policy_title: z.string().min(1),
  excerpt: z.string().min(1),
});

export const quickActionSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1),
});

export const productCardPayloadSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number(),
  original_price: z.number().optional(),
  availability_status: z.string().min(1),
  is_promotion_eligible: z.boolean(),
  warranty_duration: z.string().min(1),
  return_window_days: z.number().int().nonnegative(),
  specifications: z.record(z.string()),
  image_url: z.string().optional(),
  rating: z.number().optional(),
  review_count: z.number().int().optional(),
});

export const orderItemPayloadSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number(),
});

export const orderCardPayloadSchema = z.object({
  order_number: z.string().min(1),
  order_date: z.string().min(1),
  status: z.string().min(1),
  delivery_status: z.string().min(1),
  tracking_number: z.string().optional(),
  estimated_delivery_date: z.string().optional(),
  refund_status: z.string().optional(),
  items: z.array(orderItemPayloadSchema),
  can_initiate_return: z.boolean(),
});

export const escalationPayloadSchema = z.object({
  ticket_number: z.string().min(1),
  estimated_wait_minutes: z.number().int().nonnegative(),
  queue_position: z.number().int().nonnegative(),
  case_summary: z.string().min(1),
  actions_completed: z.array(
    z.object({
      label: z.string().min(1),
      detail: z.string().min(1),
    }),
  ),
});

export const refusalPayloadSchema = z.object({
  reason: z.string().min(1),
  policy_title: z.string().min(1),
  policy_bullets: z.array(z.string().min(1)),
  order_context: z
    .object({
      order_number: z.string().min(1),
      product_name: z.string().min(1),
      delivered_date: z.string().min(1),
    })
    .optional(),
});

export const loyaltyPayloadSchema = z.object({
  current_balance: z.number().int(),
  tier: z.string().optional(),
  recent_transactions: z.array(
    z.object({
      date: z.string().min(1),
      description: z.string().min(1),
      points: z.number().int(),
      type: z.string().min(1),
    }),
  ),
});

export const responsePayloadSchema = z.union([
  productCardPayloadSchema,
  orderCardPayloadSchema,
  escalationPayloadSchema,
  refusalPayloadSchema,
  loyaltyPayloadSchema,
]);

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
  response_type: z.enum([
    "text",
    "product_card",
    "order_card",
    "escalation",
    "refusal",
    "loyalty_card",
  ]),
  message: z.string().min(1),
  message_text: z.string().min(1),
  payload: responsePayloadSchema.optional(),
  policy_citations: z.array(policyCitationSchema).optional(),
  quick_actions: z.array(quickActionSchema).optional(),
  ui_actions: z.array(uiActionSchema),
  citations: z.array(citationSchema),
  tool_trace: z.array(toolTraceSchema),
  errors: z.array(userErrorSchema),
  confidence_score: z.number().min(0).max(1).optional(),
  summary: z.string().optional(),
  follow_up: z.string().optional(),
  show_sources: z.boolean().optional(),
  // Set only on the first message of a session; instructs the client to rename the session.
  session_title: z.string().min(1).max(80).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolTrace = z.infer<typeof toolTraceSchema>;
