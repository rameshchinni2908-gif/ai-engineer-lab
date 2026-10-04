import { describe, expect, it } from "vitest";
import { buildProviderErrorMessage } from "./http-error.js";

describe("buildProviderErrorMessage", () => {
  it("truncates a long upstream error body to ~200 chars", () => {
    const longBody = "x".repeat(5000);
    const message = buildProviderErrorMessage("OpenAI", 500, longBody);
    expect(message.length).toBeLessThan(longBody.length);
    expect(message).toContain("...(truncated)");
    expect(message).toContain("500");
  });

  it("passes short bodies through untruncated", () => {
    const message = buildProviderErrorMessage("Anthropic", 400, "bad request: missing model");
    expect(message).toContain("bad request: missing model");
    expect(message).not.toContain("truncated");
  });

  it("omits the upstream body entirely for 401", () => {
    const message = buildProviderErrorMessage("OpenAI", 401, "Bearer sk-live-SECRET_KEY leaked in body");
    expect(message).not.toContain("sk-live-SECRET_KEY");
    expect(message).not.toContain("Bearer");
  });

  it("omits the upstream body entirely for 403", () => {
    const message = buildProviderErrorMessage("Anthropic", 403, "forbidden: request echoed prompt ABC");
    expect(message).not.toContain("echoed prompt ABC");
  });
});
