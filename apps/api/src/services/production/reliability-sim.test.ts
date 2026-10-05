import { describe, expect, it } from "vitest";
import { runReliabilitySim } from "./reliability-sim.js";

describe("reliability-sim: timeout scenario (retry/backoff sequencing)", () => {
  it("fails visibly when the policy has no retry budget (policy 'off')", () => {
    const result = runReliabilitySim("timeout", { maxRetries: 0, backoffMs: 100 });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]!.outcome).toBe("fail");
    expect(result.finalOutcome).toBe("failed");
  });

  it("recovers once enough retries are allowed past the injected failure count", () => {
    const result = runReliabilitySim("timeout", { maxRetries: 2, backoffMs: 100 });
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0]!.outcome).toBe("fail");
    expect(result.attempts[1]!.outcome).toBe("fail");
    expect(result.attempts[2]!.outcome).toBe("success");
    expect(result.finalOutcome).toBe("success");
  });

  it("applies increasing backoff on each successive retry attempt", () => {
    const result = runReliabilitySim("timeout", { maxRetries: 2, backoffMs: 100 });
    // attempt 2 backoff = 100 * 2^0 = 100; attempt 3 backoff = 100 * 2^1 = 200
    const attempt2Backoff = result.attempts[1]!.latencyMs - 3000; // minus TIMEOUT_LATENCY_MS
    const attempt3Backoff = result.attempts[2]!.latencyMs - 150; // minus SUCCESS_LATENCY_MS
    expect(attempt3Backoff).toBeGreaterThan(attempt2Backoff);
  });

  it("stops retrying immediately once an attempt succeeds", () => {
    const result = runReliabilitySim("timeout", { maxRetries: 10, backoffMs: 10 });
    expect(result.attempts).toHaveLength(3); // never uses all 10 retries
  });
});

describe("reliability-sim: provider-down scenario (circuit breaker + fallback)", () => {
  it("fails on every attempt with no fallback configured", () => {
    const result = runReliabilitySim("provider-down", { maxRetries: 2, backoffMs: 50 });
    expect(result.attempts.every((a) => a.outcome === "fail")).toBe(true);
    expect(result.finalOutcome).toBe("failed");
  });

  it("the circuit breaker short-circuits to near-zero latency once the threshold of consecutive failures is hit", () => {
    const result = runReliabilitySim("provider-down", {
      maxRetries: 3,
      backoffMs: 50,
      circuitBreakerThreshold: 1,
    });
    // attempt 1: breaker still closed, full slow failure latency.
    expect(result.attempts[0]!.latencyMs).toBeGreaterThan(100);
    // attempt 2+: breaker open (1 consecutive failure already recorded), fast-fail.
    expect(result.attempts[1]!.latencyMs).toBeLessThan(10);
  });

  it("recovers via the configured fallback provider on the first retry", () => {
    const result = runReliabilitySim("provider-down", {
      maxRetries: 2,
      backoffMs: 50,
      fallbackProviderId: "mock",
    });
    expect(result.finalOutcome).toBe("success");
    expect(result.attempts[result.attempts.length - 1]!.outcome).toBe("success");
  });

  it("fallback is never used if the policy grants zero retries", () => {
    const result = runReliabilitySim("provider-down", {
      maxRetries: 0,
      backoffMs: 50,
      fallbackProviderId: "mock",
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.finalOutcome).toBe("failed");
  });
});

describe("reliability-sim: rate-limited scenario", () => {
  it("fails on the first attempt and succeeds on the backoff-delayed retry", () => {
    const result = runReliabilitySim("rate-limited", { maxRetries: 1, backoffMs: 500 });
    expect(result.attempts[0]!.outcome).toBe("fail");
    expect(result.attempts[1]!.outcome).toBe("success");
    expect(result.attempts[1]!.latencyMs).toBeGreaterThanOrEqual(500);
  });

  it("stays failed with no retry budget", () => {
    const result = runReliabilitySim("rate-limited", { maxRetries: 0, backoffMs: 500 });
    expect(result.attempts).toHaveLength(1);
    expect(result.finalOutcome).toBe("failed");
  });
});

describe("reliability-sim: duplicate-request scenario (idempotency dedup)", () => {
  it("requires an idempotencyKey", () => {
    expect(() => runReliabilitySim("duplicate-request", { maxRetries: 0, backoffMs: 0 })).toThrow();
  });

  it("the original request succeeds and the duplicate is deduplicated, not re-executed", () => {
    const result = runReliabilitySim("duplicate-request", {
      maxRetries: 0,
      backoffMs: 0,
      idempotencyKey: "key-123",
    });
    expect(result.attempts[0]!.outcome).toBe("success");
    expect(result.attempts[1]!.outcome).toBe("deduplicated");
    expect(result.finalOutcome).toBe("success");
    expect(result.idempotencyKey).toBe("key-123");
  });

  it("the deduplicated attempt is far cheaper (latency) than re-executing would have been", () => {
    const result = runReliabilitySim("duplicate-request", {
      maxRetries: 0,
      backoffMs: 0,
      idempotencyKey: "key-123",
    });
    expect(result.attempts[1]!.latencyMs).toBeLessThan(result.attempts[0]!.latencyMs);
  });
});

describe("reliability-sim: queue-backpressure scenario", () => {
  it("shows the failure (queued requests) when concurrency is bare minimum (policy 'off')", () => {
    const result = runReliabilitySim("queue-backpressure", { maxRetries: 0, backoffMs: 0, queueConcurrency: 1 });
    expect(result.attempts.some((a) => a.outcome === "queued")).toBe(true);
    expect(result.finalOutcome).toBe("failed");
  });

  it("raising queueConcurrency clears the backlog and everything succeeds", () => {
    const result = runReliabilitySim("queue-backpressure", { maxRetries: 0, backoffMs: 0, queueConcurrency: 10 });
    expect(result.attempts.every((a) => a.outcome === "success")).toBe(true);
    expect(result.finalOutcome).toBe("success");
  });

  it("queueDepthOverTime decreases monotonically to zero", () => {
    const result = runReliabilitySim("queue-backpressure", { maxRetries: 0, backoffMs: 0, queueConcurrency: 2 });
    const depths = result.queueDepthOverTime!;
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]!).toBeLessThanOrEqual(depths[i - 1]!);
    }
    expect(depths[depths.length - 1]).toBe(0);
  });

  it("defaults queueConcurrency to 1 (worst case) when omitted", () => {
    const withDefault = runReliabilitySim("queue-backpressure", { maxRetries: 0, backoffMs: 0 });
    const explicit1 = runReliabilitySim("queue-backpressure", { maxRetries: 0, backoffMs: 0, queueConcurrency: 1 });
    expect(withDefault.attempts).toEqual(explicit1.attempts);
  });
});
