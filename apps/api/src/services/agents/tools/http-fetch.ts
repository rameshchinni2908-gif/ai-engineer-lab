import type { ToolDefinition } from "@ail/shared";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const httpFetchDefinition: ToolDefinition = {
  name: "http_fetch",
  description: "Fetches a URL, but ONLY if its host is on a fixed allow-list; blocks private/loopback/link-local IPs and metadata endpoints (SSRF defense). Returns a deterministic mock body for allow-listed hosts - never makes a real outbound network call in this environment.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  dangerous: true,
  category: "network",
};

/** Deny-by-default: only these hosts (exact match) may ever be fetched. */
const ALLOW_LIST = new Set(["docs.ail-example.com", "api.ail-example.com"]);

const MOCK_RESPONSES: Record<string, string> = {
  "docs.ail-example.com": JSON.stringify({ title: "AI Engineer Lab docs (mock)", status: "ok" }),
  "api.ail-example.com": JSON.stringify({ status: "ok", data: { example: true } }),
};

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || host.includes(":");
}

/** Blocks 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16 (incl. the 169.254.169.254 metadata endpoint), and ::1/loopback IPv6. */
function isPrivateOrLoopbackIp(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "localhost" || h === "0.0.0.0") return true;
  const parts = h.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    // Not a dotted-quad IPv4 literal. Still block obviously-private IPv6
    // forms (fc00::/7 unique-local, fe80::/10 link-local).
    return h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata 169.254.169.254)
  return false;
}

export interface HttpFetchValidation {
  allowed: boolean;
  reason?: string;
  host?: string;
}

/** Pure validation, exported for direct unit testing of the SSRF/allow-list logic. */
export function validateFetchUrl(rawUrl: string): HttpFetchValidation {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: `protocol "${parsed.protocol}" is not allowed (http/https only)`, host: parsed.hostname };
  }
  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrLoopbackIp(host)) {
    return { allowed: false, reason: `host "${host}" resolves to a private/loopback/link-local address (SSRF-blocked)`, host };
  }
  if (isIpLiteral(host)) {
    return { allowed: false, reason: `raw IP literal hosts are never allow-listed: "${host}"`, host };
  }
  if (!ALLOW_LIST.has(host)) {
    return { allowed: false, reason: `host "${host}" is not on the allow-list (deny by default)`, host };
  }
  return { allowed: true, host };
}

export async function runHttpFetch(args: unknown): Promise<ToolExecOutcome> {
  const a = args as { url?: unknown };
  if (typeof a?.url !== "string" || a.url.trim().length === 0) {
    return fail("http_fetch: missing required string argument 'url'");
  }

  const validation = validateFetchUrl(a.url);
  if (!validation.allowed) {
    return fail(`http_fetch: blocked - ${validation.reason}`);
  }

  // Deliberately NOT a real network call (no `fetch()`/socket anywhere in
  // this module) - returns a deterministic canned body for the allow-listed
  // host, so this tool is hermetic/offline-safe like the rest of Mock mode,
  // while the allow-list/SSRF validation above is fully real and testable.
  const body = MOCK_RESPONSES[validation.host!] ?? JSON.stringify({ status: "ok" });
  return ok(body);
}
