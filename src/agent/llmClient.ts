import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config.js";

function normalizeOpenAiCompatBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  return trimmed;
}

export function getChatModel() {
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
    temperature: 0.1,
  });
}
