import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().url().default("postgresql://copilot:copilot@localhost:5432/copilot"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  LLM_PROVIDER: z.enum(["openai_compat", "google"]).default("openai_compat"),
  LLM_MODEL: z.string().default("MiniMaxAI/MiniMax-M2.5-TEE"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://llm.chutes.ai/v1/chat/completions"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3-flash-preview"),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().optional(),
  LANGCHAIN_TRACING_V2: z.string().optional(),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(10).default(4),
  AGENT_MAX_PLANNING_ITERATIONS: z.coerce.number().int().min(1).max(5).default(2),
  SEARCH_PROVIDER: z.enum(["duckduckgo", "tavily"]).default("tavily"),
  TAVILY_API_KEY: z.string().optional(),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
  ECOMMERCE_API_URL: z.string().default(process.env.VELORA_API_URL ?? process.env.ALETIA_API_URL ?? "http://localhost:4001"),
  ECOMMERCE_API_KEY: z.string().default(process.env.VELORA_API_KEY ?? process.env.VELORA_API_KEY ?? ""),
  ECOMMERCE_DATABASE_URL: z.string().url().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  VELORA_API_URL: z.string().default(process.env.ALETIA_API_URL ?? "http://localhost:4001"),
  VELORA_API_KEY: z.string().default(process.env.VELORA_API_KEY ?? ""),
  ALETIA_API_URL: z.string().optional(),
  VELORA_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
