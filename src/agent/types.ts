import type { ChatResponse } from "../chat/contracts.js";
import type { ArtifactType } from "../artifacts/types.js";
import type { ToolName } from "./toolRegistry.js";
import type { SpecialistSkillName } from "./skillRegistry.js";

export type AgentToolInput = string | Record<string, unknown>;

export type AgentUiAction = {
  id: string;
  type: "table" | "chart" | "card" | "button";
  title: string;
  // table
  columns?: string[];
  rows?: Array<Record<string, string>>;
  // chart
  chartType?: "bar" | "line" | "pie";
  series?: Array<{ name: string; data: Array<{ label: string; value: number }> }>;
  // card / button
  description?: string;
  buttonLabel?: string;
  href?: string;
};

export type AgentStepResult = {
  step: number;
  tool: string; // ToolName for real tools, "activated_skill:<name>" for injected capability markers
  tool_input: AgentToolInput;
  status: "success" | "blocked" | "error";
  data: Record<string, unknown>;
  citation?: { label: string; source: string; uri?: string };
  error_message?: string;
};

export type AgentAction =
  | {
      type: "call_skill";
      intent: string;
      skill: SpecialistSkillName;
      rationale?: string;
    }
  | {
      type: "call_tool";
      intent: string;
      tool: ToolName;
      tool_input: AgentToolInput;
      rationale?: string;
    }
  | {
      type: "respond";
      intent: string;
      response_type: "text" | "product_card" | "order_card" | "escalation" | "refusal" | "loyalty_card";
      message_text: string;
      payload?: ChatResponse["payload"];
      confidence_score?: number;
      policy_citations?: ChatResponse["policy_citations"];
      quick_actions?: ChatResponse["quick_actions"];
      ui_actions?: AgentUiAction[];
      summary?: string;
      follow_up?: string;
      show_sources?: boolean;
    }
  | {
      type: "artefact";
      intent: string;
      artifact_type: ArtifactType;
      title: string;
      summary: string;
      content: unknown;
    };

export type AgentRunResult = ChatResponse;
