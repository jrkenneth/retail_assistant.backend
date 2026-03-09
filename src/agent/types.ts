import type { ChatResponse } from "../chat/contracts.js";
import type { SkillName } from "./skillRegistry.js";
import type { ToolName } from "./toolRegistry.js";

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
  tool: string; // ToolName for real tools, "call_skill:<name>" for skill lookups
  tool_input: string;
  status: "success" | "error";
  data: Record<string, unknown>;
  citation?: { label: string; source: string; uri?: string };
  error_message?: string;
};

export type AgentAction =
  | {
      type: "call_tool";
      intent: string;
      tool: ToolName;
      tool_input: string;
      rationale?: string;
    }
  | {
      type: "call_skill";
      intent: string;
      skill: SkillName;
    }
  | {
      type: "respond";
      intent: string;
      message_text: string;
      ui_actions?: AgentUiAction[];
      summary?: string;
      follow_up?: string;
      show_sources?: boolean;
    }
  | {
      type: "artefact";
      intent: string;
      document_type: string;
      title: string;
      summary: string;
      html: string;
    };

export type AgentRunResult = ChatResponse;

// ─── Plan-and-Execute types ────────────────────────────────────────────────

export type PlannedStep =
  | { step: number; type: "call_skill"; skill: SkillName }
  | { step: number; type: "call_tool"; tool: ToolName; tool_input: string }
  | { step: number; type: "respond" }
  | { step: number; type: "artefact" };

export type AgentPlan = {
  intent: string;
  steps: PlannedStep[];
};

