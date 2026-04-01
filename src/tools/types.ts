import type { AuthenticatedUser } from "../auth/types.js";

export type ToolResultKind = "status" | "record" | "list" | "search";

export type ToolResultEnvelope<TPayload> = {
  ok: boolean;
  kind: ToolResultKind;
  payload: TPayload;
  summary?: string;
  user_safe_error?: string;
};

export type ToolResult<TData> = {
  tool: string;
  version: string;
  data: ToolResultEnvelope<TData>;
  citation?: {
    label: string;
    source: string;
    uri?: string;
  };
};

export type ToolContext = {
  correlationId: string;
  user: AuthenticatedUser;
  ipAddress?: string;
};
