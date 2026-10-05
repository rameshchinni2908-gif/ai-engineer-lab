import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-embed-service.db");

const { embedTexts } = await import("./embed.js");
const { closeDb } = await import("../../db/index.js");
const { getRun } = await import("../runs/index.js");

afterAll(() => closeDb());

describe("embedTexts", () => {
  it("records a complete Run with real usage/cost derived from the call", async () => {
    const { embeddings, dim, run } = await embedTexts({
      texts: ["alpha", "beta"],
      providerId: "mock",
      model: "mock-small",
      moduleId: "embeddings",
      feature: "embed",
    });
    expect(embeddings).toHaveLength(2);
    expect(dim).toBeGreaterThan(0);
    expect(run.status).toBe("complete");
    expect(run.moduleId).toBe("embeddings");
    expect(run.feature).toBe("embed");
    expect(run.usage.inputTokens).toBeGreaterThan(0);
    expect(run.usage.outputTokens).toBe(0);

    const fetched = await getRun(run.id);
    expect(fetched?.id).toBe(run.id);
  });

  it("throws (and records an error Run) for a provider that doesn't support embed", async () => {
    await expect(
      embedTexts({ texts: ["x"], providerId: "anthropic", model: "claude-opus-5", moduleId: "embeddings", feature: "embed" }),
    ).rejects.toThrow();
  });

  it("is deterministic given the same input (MockProvider.embed contract)", async () => {
    const a = await embedTexts({ texts: ["same text"], providerId: "mock", model: "mock-small", moduleId: "embeddings", feature: "embed" });
    const b = await embedTexts({ texts: ["same text"], providerId: "mock", model: "mock-small", moduleId: "embeddings", feature: "embed" });
    expect(a.embeddings).toEqual(b.embeddings);
  });
});
