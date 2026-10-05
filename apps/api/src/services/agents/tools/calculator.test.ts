import { describe, expect, it } from "vitest";
import { runCalculator } from "./calculator.js";

describe("calculator tool", () => {
  it("evaluates basic arithmetic with operator precedence", async () => {
    const outcome = await runCalculator({ expression: "2 + 3 * 4" });
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toBe("14");
  });

  it("handles parentheses and decimals", async () => {
    const outcome = await runCalculator({ expression: "(2.5 + 1.5) * 2" });
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toBe("8");
  });

  it("rejects division by zero", async () => {
    const outcome = await runCalculator({ expression: "1 / 0" });
    expect(outcome.isError).toBe(true);
  });

  it("rejects non-arithmetic characters (not an eval sandbox escape)", async () => {
    const outcome = await runCalculator({ expression: "process.exit(1)" });
    expect(outcome.isError).toBe(true);
  });

  it("rejects a missing argument", async () => {
    const outcome = await runCalculator({});
    expect(outcome.isError).toBe(true);
  });
});
