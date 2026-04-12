import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config.js";

type ChatModelOptions = {
  thinking?: boolean;
};

function normalizeOpenAiCompatBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  return trimmed;
}

export function getChatModel(options: ChatModelOptions = {}) {
  const thinkingEnabled = options.thinking ?? true;

  if (env.LLM_PROVIDER === "google") {
    if (!env.GEMINI_API_KEY) {
      return null;
    }
    return new ChatGoogleGenerativeAI({
      model: env.LLM_MODEL,
      apiKey: env.GEMINI_API_KEY,
      temperature: 0.1,
    });
  }

  if (!env.LLM_API_KEY) {
    return null;
  }

  return new ChatOpenAI({
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY,
    configuration: {
      baseURL: normalizeOpenAiCompatBaseUrl(env.LLM_BASE_URL),
    },
    temperature: thinkingEnabled ? 0.6 : 0.2,
    topP: thinkingEnabled ? 0.95 : 0.7,
    modelKwargs: {
      top_k: 20,
      chat_template_kwargs: {
        enable_thinking: thinkingEnabled,
      },
    },
  });
}

export function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function extractMessageText(content: unknown): string {
  const rawText =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((item) =>
              typeof item === "string"
                ? item
                : item && typeof item === "object" && "text" in item
                  ? String((item as { text?: unknown }).text ?? "")
                  : "",
            )
            .join("")
        : String(content ?? "");

  return stripThinkBlocks(rawText).trim();
}
