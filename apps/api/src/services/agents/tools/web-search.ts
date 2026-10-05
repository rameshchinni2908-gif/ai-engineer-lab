import type { ToolDefinition } from "@ail/shared";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description: "Searches a small deterministic mock corpus (no real internet access) and returns the top matches.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, topK: { type: "number" } },
    required: ["query"],
  },
  category: "search",
};

interface MockDoc {
  title: string;
  url: string;
  snippet: string;
}

/** Deterministic, hand-authored mock corpus - same every run, keyed by keyword overlap, not an LLM. */
const CORPUS: MockDoc[] = [
  {
    title: "ReAct: Synergizing Reasoning and Acting in Language Models",
    url: "https://mock.ail/corpus/react-paper",
    snippet: "ReAct interleaves reasoning traces ('thoughts') with task-specific actions (tool calls), letting an agent update its plan based on real observations instead of reasoning in isolation.",
  },
  {
    title: "Model Context Protocol (MCP) overview",
    url: "https://mock.ail/corpus/mcp-overview",
    snippet: "MCP standardizes how an LLM application discovers and calls tools exposed by a separate server process, decoupling tool implementation from the agent that uses it.",
  },
  {
    title: "Loop detection in autonomous agents",
    url: "https://mock.ail/corpus/loop-detection",
    snippet: "A sliding-window similarity check over recent agent steps catches an agent repeating near-identical tool calls without progress, before it exhausts its full step budget.",
  },
  {
    title: "Human-in-the-loop approval gates",
    url: "https://mock.ail/corpus/hitl-approval",
    snippet: "Pausing an agent run before a dangerous tool call and requiring explicit human approval is only an effective safeguard if approvals are genuinely reviewed, not rubber-stamped.",
  },
  {
    title: "Sandboxing untrusted code execution",
    url: "https://mock.ail/corpus/sandbox-isolation",
    snippet: "Isolating code execution in a separate worker/process with no filesystem or network access, a hard timeout, and a memory cap prevents an agent's generated code from affecting the host.",
  },
  {
    title: "Server-side request forgery (SSRF) via tool-initiated HTTP calls",
    url: "https://mock.ail/corpus/ssrf-http-fetch",
    snippet: "An HTTP-fetching tool must deny-by-default, allow-list hosts explicitly, and block private/loopback/link-local IP ranges and metadata endpoints to avoid SSRF.",
  },
  {
    title: "Vector memory and retrieval for agents",
    url: "https://mock.ail/corpus/vector-memory",
    snippet: "Long-term agent memory backed by a vector store lets a run retrieve semantically similar prior conclusions, but without provenance metadata a wrong conclusion can be retrieved just as confidently as a correct one.",
  },
];

function score(query: string, doc: MockDoc): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${doc.title} ${doc.snippet}`.toLowerCase();
  return q.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
}

export async function runWebSearch(args: unknown): Promise<ToolExecOutcome> {
  const a = args as { query?: unknown; topK?: unknown };
  if (typeof a?.query !== "string" || a.query.trim().length === 0) {
    return fail("web_search: missing required string argument 'query'");
  }
  const topK = typeof a.topK === "number" && a.topK > 0 ? Math.floor(a.topK) : 3;

  const ranked = CORPUS.map((doc) => ({ doc, s: score(a.query as string, doc) }))
    .sort((x, y) => y.s - x.s || x.doc.url.localeCompare(y.doc.url))
    .slice(0, topK);

  if (ranked.every((r) => r.s === 0)) {
    return ok(JSON.stringify({ query: a.query, results: [] }));
  }

  return ok(
    JSON.stringify({
      query: a.query,
      results: ranked.map((r) => ({ title: r.doc.title, url: r.doc.url, snippet: r.doc.snippet })),
    }),
  );
}
