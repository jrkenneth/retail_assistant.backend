import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../config.js";
import { logEvent } from "../chat/logger.js";
import { extractMessageText, getChatModel } from "./llmClient.js";
import {
  SPECIALIST_SKILL_NAMES,
  VALID_SKILL_NAMES,
  type SpecialistSkillName,
} from "./skillRegistry.js";
import type { ModeOptions } from "./systemPrompt.js";

export type AgentRoute = {
  skills: SpecialistSkillName[];
  can_answer_directly: boolean;
};

function fallbackRoute(prompt: string): AgentRoute {
  const normalized = prompt.toLowerCase();
  const skills = new Set<SpecialistSkillName>();

  if (/\b(product|products|spec|specs|compare|availability|stock|warranty|promotion)\b/.test(normalized)) {
    skills.add("product_enquiry_skill");
  }

  if (/\b(order|orders|tracking|track|shipment|delivery|delivered|package)\b/.test(normalized)) {
    skills.add("order_management_skill");
  }

  if (/\b(return|returns|refund|exchange|return window)\b/.test(normalized)) {
    skills.add("returns_skill");
  }

  if (/\b(loyalty|points|reward|rewards)\b/.test(normalized)) {
    skills.add("loyalty_skill");
  }

  if (/\b(policy|policies|terms|refund policy|shipping policy|warranty policy|privacy)\b/.test(normalized)) {
    skills.add("policy_rag_skill");
  }

  if (/\b(human|specialist|agent|escalate|complaint|angry|upset|frustrated|manager)\b/.test(normalized)) {
    skills.add("escalation_skill");
  }

  if (/\b(competitor|competitors|payment|pay now|credit card|another customer|other customer|guarantee|promise)\b/.test(normalized)) {
    skills.add("governance_skill");
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
          .filter(
            (value): value is SpecialistSkillName =>
              VALID_SKILL_NAMES.has(value) && SPECIALIST_SKILL_NAMES.includes(value as SpecialistSkillName),
          )
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
    "You are a lightweight specialist-skill router for Lena, Velora's retail customer service assistant.",
    "Select which specialist skills should be active before the main agent loop begins.",
    "Return JSON only in the form:",
    '{"skills":["product_enquiry_skill","order_management_skill"],"can_answer_directly":false}',
    `Choose only from these specialist skills: ${SPECIALIST_SKILL_NAMES.join(", ")}.`,
    "Routing guidance:",
    "- product_enquiry_skill: products, specifications, comparisons, warranties, availability, promotions.",
    "- order_management_skill: order lookup, delivery status, shipment tracking, order summaries.",
    "- returns_skill: return eligibility, refunds, return windows, return status.",
    "- loyalty_skill: points balance, loyalty history, earning and redemption questions.",
    "- policy_rag_skill: policy interpretation requests, especially returns, shipping, warranty, privacy, loyalty, payments.",
    "- escalation_skill: human handoff requests, sensitive complaints, unresolved delivery/refund issues.",
    "- governance_skill: competitor questions, payment handling, policy over-promising, privacy or cross-customer requests.",
    "- Multiple skills may be selected when needed.",
    "- Set can_answer_directly=true only for greetings, thanks, simple conversational replies, or other requests that do not need specialist guidance.",
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
