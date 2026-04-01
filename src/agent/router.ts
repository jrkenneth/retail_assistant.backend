import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config.js";
import { logEvent } from "../chat/logger.js";
import { extractMessageText, getChatModel } from "./llmClient.js";
import { VALID_SKILL_NAMES, type SkillName } from "./skillRegistry.js";
import type { ModeOptions } from "./systemPrompt.js";

export type AgentRoute = {
  skills: SkillName[];
  can_answer_directly: boolean;
};

function fallbackRoute(prompt: string): AgentRoute {
  const normalized = prompt.toLowerCase();
  const skills = new Set<SkillName>();

  if (
    /\b(aletia|employee|employees|leave|payroll|salary|compensation|bonus|performance|review|reviews|employment history|career history|manager|direct reports|department|hr system|hr platform|hr service|availability|uptime)\b/.test(
      normalized,
    )
  ) {
    skills.add("querydb");
  }

  if (
    /\b(report|deck|presentation|slides|spreadsheet|xlsx|pptx|docx|pdf|document|memo|brief|one-pager|one pager|proposal|plan|strategy|roadmap)\b/.test(
      normalized,
    )
  ) {
    skills.add("artefact_design");
  }

  if (
    /\b(latest|recent|current|today|news|market|benchmark|trend|trends|web|online|search|research|external)\b/.test(
      normalized,
    )
  ) {
    skills.add("web_research");
  }

  const canAnswerDirectly =
    skills.size === 0 &&
    /\b(thanks|thank you|hello|hi|hey|good morning|good afternoon|good evening)\b/.test(normalized);

  return {
    skills: Array.from(skills),
    can_answer_directly: canAnswerDirectly,
  };
}

function parseRoute(raw: string): AgentRoute | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  const candidate =
    jsonStart >= 0 && jsonEnd > jsonStart ? trimmed.slice(jsonStart, jsonEnd + 1) : trimmed;

  try {
    const parsed = JSON.parse(candidate) as {
      skills?: unknown;
      can_answer_directly?: unknown;
    };

    const skills = Array.isArray(parsed.skills)
      ? parsed.skills
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value): value is SkillName => VALID_SKILL_NAMES.has(value))
      : [];

    return {
      skills: Array.from(new Set(skills)),
      can_answer_directly: parsed.can_answer_directly === true,
    };
  } catch {
    return null;
  }
}

export async function routeRequest(
  prompt: string,
  correlationId: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
  modes: ModeOptions = { research: false, thinking: true },
): Promise<AgentRoute> {
  const model = getChatModel({ thinking: modes.thinking });
  if (!model) {
    return fallbackRoute(prompt);
  }

  const systemPrompt = [
    "You are a lightweight capability router for an internal agent.",
    "Select which specialist skills should be active before the main agent loop begins.",
    "Return JSON only in the form:",
    '{"skills":["querydb","web_research","artefact_design"],"can_answer_directly":false}',
    "Choose from these skills only: querydb, web_research, artefact_design.",
    "Routing guidance:",
    "- querydb: Aletia HR platform requests, including employee, leave, payroll, performance, employment history, HR system status, Aletia availability, HR platform, or HR service questions.",
    "- web_research: current events, public web facts, external benchmarks, market trends, recent developments, or online research.",
    "- artefact_design: requested deliverables like reports, decks, presentations, spreadsheets, memos, briefs, PDFs, DOCX, PPTX, XLSX, or structured documents.",
    "- Multiple skills may be selected when needed.",
    "- Set can_answer_directly=true only for greetings, thanks, simple conversational replies, or other requests that do not need specialist guidance.",
    "- If the request mentions Aletia, HR platform, HR service, HR system, or service availability, include querydb.",
  ].join("\n");

  const userPrompt = [
    `User request: ${prompt}`,
    history.length > 0
      ? `Recent conversation:\n${history
          .slice(-4)
          .map((turn) => `${turn.role}: ${turn.text}`)
          .join("\n")}`
      : "Recent conversation: none",
  ].join("\n");

  for (let iteration = 1; iteration <= 2; iteration += 1) {
    try {
      const message = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const rawText = extractMessageText(message.content);
      const route = parseRoute(rawText);
      if (route) {
        logEvent("info", "agent.route.success", correlationId, {
          iteration,
          model: env.LLM_MODEL,
          skills: route.skills,
          can_answer_directly: route.can_answer_directly,
        });
        return route;
      }
    } catch (error) {
      logEvent("warn", "agent.route.error", correlationId, {
        iteration,
        model: env.LLM_MODEL,
        error_message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const fallback = fallbackRoute(prompt);
  logEvent("info", "agent.route.fallback", correlationId, {
    skills: fallback.skills,
    can_answer_directly: fallback.can_answer_directly,
  });
  return fallback;
}
