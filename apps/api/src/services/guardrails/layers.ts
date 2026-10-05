import type { GuardrailFinding } from "@ail/shared";
import { redactPii } from "./pii.js";
import { validateJsonSchema } from "../evals/metrics/jsonSchemaValid.js";
import type { AttackedTool } from "./attacks.js";
import { DEMO_SECRET } from "./bot.js";

/**
 * The twelve guardrail layers from `GuardrailConfig`, each a pure function
 * (CLAUDE.md: "guardrails ... as pure functions") that inspects some piece
 * of the pipeline's state and returns zero or more `GuardrailFinding`s. Each
 * is unit-tested for BOTH "blocks/redacts what it should" AND "lets benign
 * input through" - see `layers.test.ts`.
 */

function finding(
  layer: GuardrailFinding["layer"],
  severity: GuardrailFinding["severity"],
  action: GuardrailFinding["action"],
  message: string,
  extra: Partial<Pick<GuardrailFinding, "matchedText" | "owaspId">> = {},
): GuardrailFinding {
  return { layer, severity, action, message, ...extra };
}

// 1. inputValidation --------------------------------------------------------

// eslint-disable-next-line no-control-regex -- intentional: this layer's entire job is detecting disallowed control characters in input.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
// eslint-disable-next-line no-misleading-character-class -- intentional: each of these zero-width code points is a distinct, deliberate detection target, not an accidental combining-sequence.
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/;
const MAX_INPUT_LENGTH = 8000;

export function checkInputValidation(text: string): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  if (CONTROL_CHAR_RE.test(text)) {
    findings.push(finding("inputValidation", "medium", "block", "Input contains disallowed control characters."));
  }
  if (ZERO_WIDTH_RE.test(text)) {
    findings.push(
      finding("inputValidation", "medium", "block", "Input contains zero-width characters often used to hide text from reviewers."),
    );
  }
  if (text.length > MAX_INPUT_LENGTH) {
    findings.push(finding("inputValidation", "low", "flag", `Input is unusually long (${text.length} chars) - possible resource-exhaustion attempt.`));
  }
  return findings;
}

// 2. piiRedaction -------------------------------------------------------------

export function checkPiiRedaction(text: string): { findings: GuardrailFinding[]; redacted: string } {
  const { redacted, matches } = redactPii(text);
  const findings = matches.map((m) =>
    finding("piiRedaction", "medium", "redact", `Redacted a ${m.type.replace("_", " ")} found in the content.`, {
      matchedText: m.value,
    }),
  );
  return { findings, redacted };
}

// 3. injectionClassifier -----------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior) instructions/i,
  /disregard (all )?(previous|prior|system) (instructions|rules)/i,
  /system\s*override/i,
  /you are now [a-z]+.{0,40}no restrictions/i,
  /act as (dan|an? unrestricted)/i,
  /\bno restrictions\b/i,
  /reveal (your |the )?system prompt/i,
  /repeat (your |the )?(exact )?(system prompt|configuration)/i,
  /\bverbatim\b.{0,30}\b(system prompt|secret|key)\b/i,
];

export function checkInjectionClassifier(text: string): GuardrailFinding[] {
  const matched = INJECTION_PATTERNS.find((re) => re.test(text));
  if (!matched) return [];
  const match = text.match(matched);
  return [
    finding(
      "injectionClassifier",
      "high",
      "block",
      "Detected a known prompt-injection/jailbreak trigger phrase.",
      { matchedText: match?.[0], owaspId: "LLM01" },
    ),
  ];
}

// 4. instructionHierarchy -----------------------------------------------------

const IMPERATIVE_OVERRIDE_RE =
  /\b(ignore|disregard|override)\b.{0,30}\b(instructions|rules)\b|system\s*override|use the \w+ tool/i;

export type ContentSource = "user" | "retrieved" | "tool_result";

/** Only relevant for content that did NOT come from the system/user - retrieved documents and tool results must never be treated as instructions. */
export function checkInstructionHierarchy(text: string, source: ContentSource): GuardrailFinding[] {
  if (source === "user") return []; // the user's own message is in-scope for injectionClassifier, not this layer
  if (!IMPERATIVE_OVERRIDE_RE.test(text)) return [];
  return [
    finding(
      "instructionHierarchy",
      "critical",
      "block",
      `Content from an untrusted source ("${source}") contained instruction-like text; it was treated as data, not a command.`,
      { owaspId: "LLM01" },
    ),
  ];
}

// 5. delimiterHardening --------------------------------------------------------

const DELIMITER_BREAKOUT_RE = /<\/\s*(system|data|trusted)\s*>|```+\s*(system|end)|-{3,}\s*end\b|system\s*override/i;

export function checkDelimiterHardening(text: string): GuardrailFinding[] {
  if (!DELIMITER_BREAKOUT_RE.test(text)) return [];
  return [
    finding(
      "delimiterHardening",
      "high",
      "block",
      "Content attempted to break out of its data delimiter to masquerade as a new system/instruction section.",
    ),
  ];
}

// 6. schemaEnforcement ----------------------------------------------------------

const TOOL_SCHEMAS: Record<string, unknown> = {
  send_email: {
    type: "object",
    required: ["to", "subject", "body"],
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
  },
  read_file: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  execute_code: { type: "object", required: ["code"], properties: { code: { type: "string" } } },
  web_search: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
};

export function checkSchemaEnforcement(tool: AttackedTool): GuardrailFinding[] {
  const schema = TOOL_SCHEMAS[tool.name];
  if (!schema) return [finding("schemaEnforcement", "medium", "block", `No known schema for tool "${tool.name}".`)];
  const { valid, issues } = validateJsonSchema(tool.arguments, schema);
  if (valid) return [];
  return [
    finding(
      "schemaEnforcement",
      "medium",
      "block",
      `Tool call arguments for "${tool.name}" failed schema validation: ${issues.map((i) => i.message).join("; ")}.`,
    ),
  ];
}

// 7. toolAllowList ----------------------------------------------------------------

export function checkToolAllowList(toolName: string, allowList: string[]): GuardrailFinding[] {
  if (allowList.includes(toolName)) return [];
  return [
    finding("toolAllowList", "high", "block", `Tool "${toolName}" is not on the current allow-list.`, {
      owaspId: "LLM08",
    }),
  ];
}

// 8. leastPrivilege ------------------------------------------------------------

const ALLOWED_EMAIL_DOMAIN = "@company-demo.test";
const SANDBOXED_PATH_PREFIX = "/fixtures/";

export function checkLeastPrivilege(tool: AttackedTool): GuardrailFinding[] {
  if (tool.name === "send_email") {
    const to = String(tool.arguments.to ?? "");
    if (!to.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return [
        finding(
          "leastPrivilege",
          "critical",
          "block",
          `send_email recipient "${to}" is outside the allowed internal domain for this bot's least-privilege scope.`,
          { owaspId: "LLM08" },
        ),
      ];
    }
  }
  if (tool.name === "read_file") {
    const path = String(tool.arguments.path ?? "");
    if (!path.startsWith(SANDBOXED_PATH_PREFIX)) {
      return [
        finding("leastPrivilege", "high", "block", `read_file path "${path}" is outside the sandboxed fixtures directory.`),
      ];
    }
  }
  return [];
}

// 9. sandbox -------------------------------------------------------------------

const SANDBOX_ESCAPE_RE = /require\s*\(|process\s*\.|child_process|import\s*\(|fs\s*\.|fetch\s*\(|\bnet\./;

export function checkSandbox(tool: AttackedTool): GuardrailFinding[] {
  if (tool.name !== "execute_code") return [];
  const code = String(tool.arguments.code ?? "");
  if (!SANDBOX_ESCAPE_RE.test(code)) return [];
  return [
    finding(
      "sandbox",
      "critical",
      "block",
      "Code attempted to use host filesystem/process/network APIs from inside the isolated sandbox; execution was blocked.",
    ),
  ];
}

// 10. rateLimit ------------------------------------------------------------------

const rateLimitState = new Map<string, number[]>();

export function resetRateLimitState(): void {
  rateLimitState.clear();
}

/** Sliding-window counter, keyed by caller-provided `key` (e.g. a session/provider id). Pure w.r.t. its explicit state map; exported reset lets tests isolate windows. */
export function recordAndCheckRateLimit(key: string, limit = 5, windowMs = 10_000, now = Date.now()): GuardrailFinding[] {
  const timestamps = (rateLimitState.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  rateLimitState.set(key, timestamps);
  if (timestamps.length > limit) {
    return [
      finding("rateLimit", "medium", "block", `Rate limit exceeded: ${timestamps.length} requests within ${windowMs}ms (limit ${limit}).`),
    ];
  }
  return [];
}

// 11. approvalGates --------------------------------------------------------------

export function checkApprovalGates(tool: AttackedTool, approved: boolean): GuardrailFinding[] {
  if (!tool.dangerous || approved) return [];
  return [
    finding(
      "approvalGates",
      "high",
      "flag",
      `Tool "${tool.name}" is marked dangerous and requires human approval before it can execute; it is being held pending approval.`,
    ),
  ];
}

// 12. outputModeration -------------------------------------------------------------

const BANNED_COMPLIANCE_RE = /as dan, i have no restrictions/i;

export function checkOutputModeration(text: string): { findings: GuardrailFinding[]; redacted: string } {
  const findings: GuardrailFinding[] = [];
  let redacted = text;

  if (redacted.includes(DEMO_SECRET)) {
    findings.push(
      finding("outputModeration", "critical", "redact", "Output contained the secret value; it was redacted before being returned.", {
        owaspId: "LLM06",
      }),
    );
    redacted = redacted.split(DEMO_SECRET).join("[REDACTED_SECRET]");
  }

  const markdownImageMatch = redacted.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
  if (markdownImageMatch) {
    findings.push(
      finding(
        "outputModeration",
        "high",
        "block",
        "Output contained a markdown image pointing at an external URL - a classic exfiltration-via-render vector - and was blocked.",
        { matchedText: markdownImageMatch[0], owaspId: "LLM02" },
      ),
    );
    redacted = redacted.replace(markdownImageMatch[0], "[BLOCKED_IMAGE_MARKDOWN]");
  }

  if (BANNED_COMPLIANCE_RE.test(redacted)) {
    findings.push(
      finding("outputModeration", "high", "block", "Output contained a jailbreak-compliance marker and was blocked."),
    );
  }

  return { findings, redacted };
}
