import type { ToolDefinition } from "@ail/shared";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const calculatorDefinition: ToolDefinition = {
  name: "calculator",
  description: "Evaluates a basic arithmetic expression (+ - * / parentheses, decimals). No code execution.",
  inputSchema: {
    type: "object",
    properties: { expression: { type: "string" } },
    required: ["expression"],
  },
  category: "math",
};

/**
 * Hand-written recursive-descent arithmetic parser/evaluator. Deliberately
 * NOT `eval`/`Function` - only digits, `.`, `+ - * / ( )`, and whitespace
 * are accepted; anything else is a parse error, not arbitrary code.
 */
class ExpressionError extends Error {}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) j++;
      tokens.push(expr.slice(i, j));
      i = j;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

function evaluate(expr: string): number {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }
  function consume(): string {
    const t = tokens[pos];
    if (t === undefined) throw new ExpressionError("Unexpected end of expression");
    pos++;
    return t;
  }

  function parsePrimary(): number {
    const t = consume();
    if (t === "(") {
      const v = parseExpr();
      if (consume() !== ")") throw new ExpressionError("Expected closing parenthesis");
      return v;
    }
    if (t === "-") return -parsePrimary();
    if (t === "+") return parsePrimary();
    const n = Number(t);
    if (Number.isNaN(n)) throw new ExpressionError(`Invalid number literal "${t}"`);
    return n;
  }

  function parseTerm(): number {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const rhs = parsePrimary();
      if (op === "*") v *= rhs;
      else {
        if (rhs === 0) throw new ExpressionError("Division by zero");
        v /= rhs;
      }
    }
    return v;
  }

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }

  if (tokens.length === 0) throw new ExpressionError("Empty expression");
  const result = parseExpr();
  if (pos !== tokens.length) throw new ExpressionError("Unexpected trailing input");
  if (!Number.isFinite(result)) throw new ExpressionError("Result is not a finite number");
  return result;
}

export async function runCalculator(args: unknown): Promise<ToolExecOutcome> {
  const expression = typeof (args as { expression?: unknown })?.expression === "string"
    ? (args as { expression: string }).expression
    : undefined;
  if (expression === undefined) return fail("calculator: missing required string argument 'expression'");
  try {
    const result = evaluate(expression);
    return ok(String(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`calculator: ${message}`);
  }
}
