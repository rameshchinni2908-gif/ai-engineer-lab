/**
 * M3 tool-calling playground's sandboxed mock tool registry (contracts.md
 * §4 M3 `/structured/tool-call`). Distinct from M6's agent tool registry -
 * these are deliberately tiny, deterministic, side-effect-free tools for
 * teaching the tool-call/tool-result round trip, never touching the real
 * filesystem/network (CLAUDE.md: "Code-execution sandbox ... no host
 * FS/network").
 */
import type { ToolDefinition } from "@ail/shared";

/** Pure: a tiny, safe arithmetic expression evaluator (+ - * / parentheses, no `eval`). */
export function evaluateArithmetic(expr: string): number {
  const tokens = expr.match(/\d+(\.\d+)?|[()+\-*/]/g) ?? [];
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }
  function next(): string {
    const t = tokens[pos];
    if (t === undefined) throw new Error("Unexpected end of expression");
    pos++;
    return t;
  }
  function parseFactor(): number {
    const t = next();
    if (t === "(") {
      const value = parseExpr();
      if (next() !== ")") throw new Error("Expected closing parenthesis");
      return value;
    }
    if (t === "-") return -parseFactor();
    const n = Number(t);
    if (Number.isNaN(n)) throw new Error(`Invalid token "${t}"`);
    return n;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  if (tokens.length === 0) throw new Error("Empty expression");
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Unexpected trailing tokens");
  return result;
}

export interface MockToolSpec {
  definition: ToolDefinition;
  /** Pure-ish synchronous executor. Throws on bad input; caller wraps that into a `ToolResult.isError`. */
  execute: (args: Record<string, unknown>) => string;
}

export const MOCK_TOOLS: Record<string, MockToolSpec> = {
  calculator: {
    definition: {
      name: "calculator",
      description: "Evaluates a basic arithmetic expression (+ - * / parentheses) and returns the numeric result.",
      inputSchema: {
        type: "object",
        properties: { expr: { type: "string" } },
        required: ["expr"],
      },
      category: "math",
    },
    execute: (args) => String(evaluateArithmetic(String(args.expr ?? ""))),
  },
  word_count: {
    definition: {
      name: "word_count",
      description: "Counts the number of whitespace-separated words in a string.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      category: "other",
    },
    execute: (args) => {
      const text = String(args.text ?? "");
      const count = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
      return String(count);
    },
  },
  reverse_text: {
    definition: {
      name: "reverse_text",
      description: "Reverses the characters of the given string.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      category: "other",
    },
    execute: (args) => String(args.text ?? "").split("").reverse().join(""),
  },
  mock_clock: {
    definition: {
      name: "mock_clock",
      description: "Returns a fixed, deterministic mock timestamp (NOT the real current time - this app never calls real system clocks from a tool for reproducibility).",
      inputSchema: { type: "object", properties: {} },
      category: "other",
    },
    execute: () => "2026-01-01T00:00:00.000Z",
  },
};

export const MOCK_TOOL_DEFINITIONS: ToolDefinition[] = Object.values(MOCK_TOOLS).map((t) => t.definition);
