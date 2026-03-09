import type { ToolResult } from "./types.js";
import { env } from "../config.js";
import { RetryableToolError } from "../chat/runtimePolicy.js";

type SearchData = {
  query: string;
  hits: Array<{ title: string; snippet: string; url?: string; source?: string; image?: string }>;
  recency_applied?: string;
};

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DuckDuckGoTopic[];
};

type DuckDuckGoResponse = {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    content?: string;
    url?: string;
    source?: string;
    image?: string;
  }>;
};

class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

function isLikelyEntityQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const tokenCount = normalized.split(/\s+/).length;
  if (tokenCount > 5) {
    return false;
  }
  const nonEntitySignals = [
    "what",
    "why",
    "how",
    "when",
    "where",
    "define",
    "explain",
    "summarize",
    "compare",
    "difference",
  ];
  return !nonEntitySignals.some((signal) => normalized.includes(signal));
}

function buildQueryVariants(query: string): string[] {
  const base = query.trim();
  if (!base) {
    return [];
  }
  if (!isLikelyEntityQuery(base)) {
    return [base];
  }

  const variants = [
    base,
    `${base} official website`,
    `${base} company profile`,
    `${base} group`,
    `${base} mauritius`,
  ];

  return [...new Set(variants)];
}

function dedupeHits(
  hits: Array<{ title: string; snippet: string; url?: string; source?: string; image?: string }>,
) {
  const seen = new Set<string>();
  const result: Array<{ title: string; snippet: string; url?: string; source?: string; image?: string }> = [];
  for (const hit of hits) {
    const key = (hit.url?.trim().toLowerCase() || hit.title.trim().toLowerCase()).slice(0, 220);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(hit);
  }
  return result;
}

function parseTopicText(text: string): { title: string; snippet: string } {
  const separatorIndex = text.indexOf(" - ");
  if (separatorIndex > 0) {
    return {
      title: text.slice(0, separatorIndex).trim(),
      snippet: text.slice(separatorIndex + 3).trim(),
    };
  }
  return { title: text, snippet: text };
}

function flattenTopics(topics: DuckDuckGoTopic[] | undefined): DuckDuckGoTopic[] {
  if (!topics?.length) {
    return [];
  }
  const flat: DuckDuckGoTopic[] = [];
  for (const topic of topics) {
    if (Array.isArray(topic.Topics)) {
      flat.push(...flattenTopics(topic.Topics));
      continue;
    }
    flat.push(topic);
  }
  return flat;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RetryableToolError("timeout", "search_api_timeout");
    }
    throw new RetryableToolError("network", "search_api_network_error");
  } finally {
    clearTimeout(timeout);
  }
}

function detectRecency(query: string): { tavilyDays?: number; label?: string } {
  const normalized = query.toLowerCase();

  if (/\b(last|past)\s+2\s+years?\b/.test(normalized) || /\b(last|past)\s+two\s+years?\b/.test(normalized)) {
    return { tavilyDays: 730, label: "last_2_years" };
  }
  if (/\b(last|past)\s+year\b/.test(normalized) || /\b(last|past)\s+12\s+months?\b/.test(normalized)) {
    return { tavilyDays: 365, label: "last_1_year" };
  }
  if (/\b(last|past)\s+6\s+months?\b/.test(normalized)) {
    return { tavilyDays: 180, label: "last_6_months" };
  }
  if (/\b(last|past)\s+month\b/.test(normalized)) {
    return { tavilyDays: 30, label: "last_1_month" };
  }

  return {};
}

async function fetchTavily(query: string): Promise<SearchData> {
  if (!env.TAVILY_API_KEY) {
    throw new SearchUnavailableError("search_api_missing_key");
  }

  const recency = detectRecency(query);
  const requestBody: Record<string, unknown> = {
    query,
    max_results: env.SEARCH_MAX_RESULTS,
    search_depth: "advanced",
    topic: "general",
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };
  if (recency.tavilyDays) {
    requestBody.days = recency.tavilyDays;
  }

  const response = await fetchWithTimeout("https://api.tavily.com/search", env.SEARCH_TIMEOUT_MS, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw new RetryableToolError("http_429", "search_api_rate_limited");
    }
    if (response.status >= 500) {
      throw new RetryableToolError("http_5xx", `search_api_http_${response.status}`);
    }
    throw new SearchUnavailableError(`search_api_http_${response.status}`);
  }

  const payload = (await response.json()) as TavilyResponse;
  const hits =
    payload.results
      ?.map((row) => ({
        title: row.title?.trim() || "Untitled",
        snippet: row.content?.trim() || "No summary available.",
        url: row.url?.trim() || undefined,
        source: row.source?.trim() || "tavily",
        image: row.image?.trim() || undefined,
      }))
      .slice(0, env.SEARCH_MAX_RESULTS) ?? [];

  if (hits.length === 0) {
    throw new SearchUnavailableError("search_api_no_results");
  }

  return {
    query,
    hits,
    recency_applied: recency.label,
  };
}

async function fetchDuckDuckGo(query: string): Promise<SearchData> {
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=0`;
  const response = await fetchWithTimeout(endpoint, env.SEARCH_TIMEOUT_MS);
  if (!response.ok) {
    if (response.status === 429) {
      throw new RetryableToolError("http_429", "search_api_rate_limited");
    }
    if (response.status >= 500) {
      throw new RetryableToolError("http_5xx", `search_api_http_${response.status}`);
    }
    throw new Error(`search_api_http_${response.status}`);
  }

  const payload = (await response.json()) as DuckDuckGoResponse;
  const hits: SearchData["hits"] = [];

  if (payload.AbstractText?.trim()) {
    hits.push({
      title: payload.Heading?.trim() || "Overview",
      snippet: payload.AbstractText.trim(),
      url: payload.AbstractURL?.trim() || undefined,
      source: "duckduckgo",
    });
  }

  for (const topic of flattenTopics(payload.RelatedTopics)) {
    if (!topic.Text?.trim()) {
      continue;
    }
    const { title, snippet } = parseTopicText(topic.Text.trim());
    hits.push({
      title,
      snippet,
      url: topic.FirstURL?.trim() || undefined,
      source: topic.Name?.trim() || "duckduckgo",
    });
    if (hits.length >= env.SEARCH_MAX_RESULTS) {
      break;
    }
  }

  return {
    query,
    hits: hits.slice(0, env.SEARCH_MAX_RESULTS),
    recency_applied: detectRecency(query).label,
  };
}

async function fetchWikipediaFallback(query: string): Promise<SearchData> {
  const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&srlimit=${env.SEARCH_MAX_RESULTS}`;
  const response = await fetchWithTimeout(endpoint, env.SEARCH_TIMEOUT_MS);
  if (!response.ok) {
    if (response.status === 429) {
      throw new RetryableToolError("http_429", "search_fallback_rate_limited");
    }
    if (response.status >= 500) {
      throw new RetryableToolError("http_5xx", `search_fallback_http_${response.status}`);
    }
    throw new Error(`search_fallback_http_${response.status}`);
  }
  const payload = (await response.json()) as {
    query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> };
  };

  const hits =
    payload.query?.search?.map((row) => ({
      title: row.title?.trim() || "Untitled",
      snippet: (row.snippet ?? "").replace(/<[^>]+>/g, "").trim(),
      url: row.pageid ? `https://en.wikipedia.org/?curid=${row.pageid}` : undefined,
      source: "wikipedia",
    })) ?? [];

  return {
    query,
    hits: hits.slice(0, env.SEARCH_MAX_RESULTS),
    recency_applied: detectRecency(query).label,
  };
}

export async function searchClient(query: string): Promise<ToolResult<SearchData>> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new SearchUnavailableError("search_api_empty_query");
  }

  const variants = buildQueryVariants(trimmedQuery).slice(0, 4);

  if (env.SEARCH_PROVIDER === "tavily") {
    const settled = await Promise.allSettled(variants.map((variant) => fetchTavily(variant)));
    const mergedHits = dedupeHits(
      settled.flatMap((item) => (item.status === "fulfilled" ? item.value.hits : [])),
    ).slice(0, env.SEARCH_MAX_RESULTS);

    if (mergedHits.length === 0) {
      throw new SearchUnavailableError("search_api_no_results");
    }

    const recency = detectRecency(trimmedQuery).label;
    return {
      tool: "search_api",
      version: "v3",
      data: {
        query: trimmedQuery,
        hits: mergedHits,
        recency_applied: recency,
      },
      citation: {
        label: "search:tavily",
        source: "search_api",
        uri: "https://tavily.com/",
      },
    };
  }

  try {
    const settled = await Promise.allSettled(variants.map((variant) => fetchDuckDuckGo(variant)));
    const mergedHits = dedupeHits(
      settled.flatMap((item) => (item.status === "fulfilled" ? item.value.hits : [])),
    ).slice(0, env.SEARCH_MAX_RESULTS);

    if (mergedHits.length > 0) {
      return {
        tool: "search_api",
        version: "v3",
        data: {
          query: trimmedQuery,
          hits: mergedHits,
          recency_applied: detectRecency(trimmedQuery).label,
        },
        citation: {
          label: "search:duckduckgo",
          source: "search_api",
          uri: "https://api.duckduckgo.com",
        },
      };
    }
  } catch {
    // fallback below
  }

  try {
    const fallback = await fetchWikipediaFallback(trimmedQuery);
    if (fallback.hits.length > 0) {
      return {
        tool: "search_api",
        version: "v3",
        data: fallback,
        citation: {
          label: "search:wikipedia",
          source: "search_api",
          uri: "https://en.wikipedia.org/wiki/Main_Page",
        },
      };
    }
  } catch {
    // final fallback below
  }

  throw new SearchUnavailableError("search_api_unavailable");
}
