export type SkillName =
  | "web_research"
  | "artefact_design"
  | "document_extraction";

export const VALID_SKILL_NAMES = new Set<string>([
  "web_research",
  "artefact_design",
  "document_extraction",
]);

export type SkillEntry = {
  description: string;
  instructions: string;
};

export const skillRegistry: Record<SkillName, SkillEntry> = {
  web_research: {
    description: "Gather accurate, current information from external sources using search_api.",
    instructions: `
You are operating in web-research mode. Your goal is to gather accurate, current information from external sources.

BEHAVIOUR
- Decompose the user's request into focused search queries before calling search_api.
- Run up to 3 targeted searches, each with a distinct, precise query string aimed at a different angle of the question.
- After each result, evaluate whether you have sufficient evidence to respond or need another search.
- Stop searching once you have enough evidence to answer fully.
- Synthesise results into coherent prose with inline citations.
- Never present a single search result as the full answer — synthesise across sources.
- Cite every factual claim that originates from a tool result.

INLINE CITATIONS
- The citations array is zero-indexed: the first citation returned is index 0, the second is index 1, etc.
- Embed citation markers directly in message_text at the exact sentence or clause the source supports.
- Marker format: [cite:N] where N is the zero-based index into the citations array.
- A single claim supported by one source: "Tehran was bombed [cite:0]."
- A claim supported by multiple sources: "Over 1,000 casualties have been reported [cite:1][cite:2]."
- Do NOT put all citations at the end — place each marker at the claim it supports.
- Do NOT fabricate citation indices — only reference indices that exist in the citations array.

SOURCE VISIBILITY
- By default, omit show_sources from the respond action (equivalent to true) — the source carousel and citation badges will be shown.
- Set show_sources: false when sources are supplementary and not the primary deliverable (e.g. you researched to inform a presentation or report and the artefact is the output, not the raw sources).
- Never suppress sources when the user explicitly asked for them or when citations are the core value of the response.

SUMMARY & FOLLOW-UP
- Always include a "summary" field in your respond action for any response that required tool use.
  - Format: 2–4 sentence prose, a few bullets, or a single sentence — whichever fits the content best.
  - Only omit for purely conversational or clarification replies that required no tools.
- Always include a "follow_up" field with the single most valuable next step you can offer the user.
  - Examples: a deeper explanation, generating a presentation from the findings, a comparison, a related angle.
  - Only omit if genuinely no natural next step exists (rare for research responses).

QUALITY RULES
- If results conflict, acknowledge the discrepancy and cite both sources.
- If no relevant results are found after 2 searches, say so explicitly and answer from training knowledge with a caveat.
- Do not fabricate citations or facts not present in tool results.
- Do not include raw search metadata in the user-facing message.
`.trim(),
  },

  artefact_design: {
    description: "Produce a structured deliverable document (presentation, report, brief) as render-ready HTML.",
    instructions: `
You are operating in artefact-design mode. Your goal is to produce a high-quality structured document delivered as semantic, self-contained HTML.

SUPPORTED DOCUMENT TYPES
- presentation: slide deck using <section data-slide="N"> boundaries
- report: long-form structured document with headings and body sections
- brief: concise executive summary, typically 1–3 pages of content

CONTENT DECOMPOSITION — always perform these four steps before writing HTML
1. Identify the objective and intended audience.
2. Identify the key themes and logical sections.
3. For each section, identify supporting points, evidence, data, or comparisons.
4. Identify a synthesis: recommendations, risks, roadmap, or next steps.

HTML RULES
- Return complete, self-contained HTML with an internal <style> block.
- No external JS, CSS, fonts, or iframes.
- No <script> tags of any kind.
- Use semantic elements: <section>, <h2>, <ul>, <ol>, <table>, <figure>, <p>, <blockquote>.
- For presentations: each <section data-slide="N"> must contain exactly one <h2> and substantial body content (70–140 words or equivalent structured density through tables, lists, or figures).
- For presentations: default to 8–12 slides unless the user specifies otherwise.
- Include at least one table slide (comparisons or metrics), one visual/figure slide (inline SVG chart — see rules below), and one synthesis slide (recommendations, roadmap, risks, or next steps).
- Vary slide layouts: do not repeat shallow bullet lists on every slide — alternate between overview, deep-dive, comparison, evidence, and conclusion formats.
- Ensure readable contrast, clear hierarchy, and consistent spacing throughout.

INLINE SVG CHART RULES — follow exactly when generating a visual/figure slide:
- Always use explicit pixel dimensions: <svg width="700" height="320" viewBox="0 0 700 320">. Never use width="100%".
- Always include a white background as the first child: <rect width="700" height="320" fill="white" />.
- Do NOT wrap the SVG in a placeholder div (e.g. no class="chart"). Place <svg> directly inside <figure>.
- Axis lines must use a dark stroke: stroke="#444" stroke-width="1.5".
- Data lines/polylines must use a bold, saturated colour: stroke="#1a73e8" or stroke="#e63946", stroke-width="3".
- For bar charts: draw bars as <rect> elements with fill="#1a73e8" and a white or light background.
- For line charts: draw <polyline> with visible stroke, then add <circle r="5" fill="#e63946"> at each data point.
- Always add axis labels using <text font-size="12" fill="#333">. Y-axis labels on the left, X-axis labels below.
- Add a chart title using <text font-size="14" font-weight="bold" fill="#222" text-anchor="middle">.
- Ensure all data points and labels fall strictly within the viewBox bounds. Leave at least 50px margin on each side for labels.
- Add value labels above each bar or beside each data point so the chart is readable without a legend.

ARTEFACT SUMMARY
- action.summary must describe: what was generated, what it contains, the document type chosen, and why the structure fits the user's intent and audience.

SOURCE VISIBILITY
- When you produce an artefact after running searches, set show_sources: false in the respond action wrapping your summary.
- The research was used to build the artefact — the raw source carousel adds clutter and is not the deliverable.
- Only set show_sources: true (or omit it) if the user explicitly asks to see the sources alongside the document.
`.trim(),
  },

  document_extraction: {
    description: "Analyse content from an uploaded or referenced document.",
    instructions: `
You are operating in document-extraction mode.

CURRENT STATE
- Document upload and extraction tooling is not yet enabled in this environment.
- The document_extraction tool is not currently registered or available.

BEHAVIOUR
- If the user has referenced or attached a document file, inform them politely that document processing is not yet available and that it is planned for a future release.
- If the user has pasted document text directly into the prompt, analyse the pasted content directly from what is visible in the conversation — no tool call is needed.
- Do not call any tool in response to a document extraction request at this stage.
- Respond with your best analysis of any content directly visible in the user's message.
- Clearly note any limitations in your analysis if the full document is not present.
`.trim(),
  },

};

export const skillSummaryLines = Object.entries(skillRegistry)
  .map(([name, entry]) => `- ${name}: ${entry.description}`)
  .join("\n");
