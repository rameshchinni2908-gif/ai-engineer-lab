import { describe, expect, it } from "vitest";
import { CliArgError, parseCliArgs, runCiCli } from "./cli.js";

describe("parseCliArgs", () => {
  it("parses --suite and one or more --threshold flags", () => {
    const args = parseCliArgs(["--suite", "suite_1", "--threshold", "exact_match=0.8", "--threshold", "latency=0.5"]);
    expect(args.suiteResultId).toBe("suite_1");
    expect(args.thresholds).toEqual({ exact_match: 0.8, latency: 0.5 });
  });

  it("accepts a custom --api-url", () => {
    const args = parseCliArgs(["--suite", "s1", "--threshold", "cost=0.5", "--api-url", "http://example.test:9999"]);
    expect(args.apiUrl).toBe("http://example.test:9999");
  });

  it("throws CliArgError when --suite is missing", () => {
    expect(() => parseCliArgs(["--threshold", "exact_match=0.8"])).toThrow(CliArgError);
  });

  it("throws CliArgError when no thresholds are given", () => {
    expect(() => parseCliArgs(["--suite", "s1"])).toThrow(CliArgError);
  });

  it("throws CliArgError on a malformed --threshold value", () => {
    expect(() => parseCliArgs(["--suite", "s1", "--threshold", "not-a-pair"])).toThrow(CliArgError);
    expect(() => parseCliArgs(["--suite", "s1", "--threshold", "exact_match=notanumber"])).toThrow(CliArgError);
  });
});

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

describe("runCiCli (injected fetch, no real network/process needed)", () => {
  it("exits 0 and reports PASS when the API reports pass:true", async () => {
    const result = await runCiCli(
      ["--suite", "suite_1", "--threshold", "exact_match=0.8"],
      fakeFetch(200, { pass: true, failures: [] }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("PASS");
  });

  it("exits 1 and reports the specific failure when the API reports pass:false", async () => {
    const result = await runCiCli(
      ["--suite", "suite_1", "--threshold", "exact_match=0.8"],
      fakeFetch(200, {
        pass: false,
        failures: [{ metricId: "exact_match", variantIndex: 1, score: 0.4, threshold: 0.8 }],
      }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("FAIL");
    expect(result.output).toContain("exact_match");
    expect(result.output).toContain("variant 1");
  });

  it("exits 1 on a non-2xx API response", async () => {
    const result = await runCiCli(
      ["--suite", "does-not-exist", "--threshold", "exact_match=0.8"],
      fakeFetch(404, { code: "NOT_FOUND", message: "not found", requestId: "req_1" }),
    );
    expect(result.exitCode).toBe(1);
  });

  it("exits 1 on a bad argv without ever making a network call", async () => {
    let called = false;
    const trackingFetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    const result = await runCiCli([], trackingFetch);
    expect(result.exitCode).toBe(1);
    expect(called).toBe(false);
  });
});
