import { describe, expect, it } from "vitest";
import { SseEventSchema } from "./sse.js";

describe("SseEventSchema", () => {
  it("parses a token event", () => {
    const parsed = SseEventSchema.parse({ type: "token", runId: "r1", token: "hi", index: 0 });
    expect(parsed.type).toBe("token");
  });

  it("parses a done event with no extra fields", () => {
    const parsed = SseEventSchema.parse({ type: "done" });
    expect(parsed.type).toBe("done");
  });

  it("rejects an unknown event type", () => {
    expect(() => SseEventSchema.parse({ type: "nonsense" })).toThrow();
  });
});
