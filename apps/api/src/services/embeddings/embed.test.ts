import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-embed-service.db");

const { embedTexts } = await import("./embed.js");
const { closeDb } = await import("../../db/index.js");
const { getRun, listRuns } = await import("../runs/index.js");

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

  it("throws, and records an error Run that can be queried back, for a provider that doesn't support embed", async () => {
    const feature = "embed-unsupported-provider-test";
    await expect(
      embedTexts({ texts: ["x"], providerId: "anthropic", model: "claude-opus-5", moduleId: "embeddings", feature }),
    ).rejects.toThrow();

    // The earlier assertion only proves the promise rejected - it says
    // nothing about whether the claimed "error Run" was actually persisted.
    // Query it back by the unique feature tag used only in this test.
    const { items } = await listRuns({ moduleId: "embeddings", feature });
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("error");
    expect(items[0]?.error).toBeTruthy();
    const fetched = await getRun(items[0]!.id);
    expect(fetched?.status).toBe("error");
  });

  it("is deterministic given the same input (MockProvider.embed contract)", async () => {
    const a = await embedTexts({ texts: ["same text"], providerId: "mock", model: "mock-small", moduleId: "embeddings", feature: "embed" });
    const b = await embedTexts({ texts: ["same text"], providerId: "mock", model: "mock-small", moduleId: "embeddings", feature: "embed" });
    expect(a.embeddings).toEqual(b.embeddings);
  });
});
