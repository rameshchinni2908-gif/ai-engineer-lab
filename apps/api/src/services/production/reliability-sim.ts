import type { ProviderId } from "@ail/shared";
import { unprocessableError } from "../../middleware/errors.js";

export type ReliabilityScenario =
  | "timeout"
  | "provider-down"
  | "rate-limited"
  | "duplicate-request"
  | "queue-backpressure";

export interface ReliabilityPolicy {
  maxRetries: number;
  backoffMs: number;
  fallbackProviderId?: ProviderId;
  circuitBreakerThreshold?: number;
  idempotencyKey?: string;
  queueConcurrency?: number;
}

export type AttemptOutcome = "success" | "fail" | "deduplicated" | "queued";

export interface ReliabilityAttempt {
  attempt: number;
  outcome: AttemptOutcome;
  latencyMs: number;
}

export interface ReliabilitySimResult {
  attempts: ReliabilityAttempt[];
  finalOutcome: "success" | "failed";
  totalLatencyMs: number;
  idempotencyKey?: string;
  queueDepthOverTime?: number[];
}

// Deterministic injected-failure constants. These model a SYNTHETIC failure
// shape (never a real provider call, per contracts §4 M9: "Pure simulation
// (injected synthetic failures/latency), no real provider calls - keeps the
// demo deterministic and free"), so the same policy always reproduces the
// same attempt sequence for teaching/testing.
const TIMEOUT_LATENCY_MS = 3000;
const SUCCESS_LATENCY_MS = 150;
const INJECTED_TIMEOUT_FAILURES = 2; // first 2 attempts against the flaky dependency time out

const PRIMARY_DOWN_LATENCY_MS = 500;
const CIRCUIT_OPEN_LATENCY_MS = 1; // breaker short-circuits instantly once open
const FALLBACK_LATENCY_MS = 180;

const RATE_LIMIT_REJECT_LATENCY_MS = 50;

const DEDUP_LOOKUP_LATENCY_MS = 2;

function finalFrom(attempts: ReliabilityAttempt[]): "success" | "failed" {
  const last = attempts[attempts.length - 1];
  return last?.outcome === "success" || last?.outcome === "deduplicated" ? "success" : "failed";
}

function totalLatencyOf(attempts: ReliabilityAttempt[]): number {
  return attempts.reduce((sum, a) => sum + a.latencyMs, 0);
}

/** `scenario: "timeout"` - exercises retry-with-backoff against a dependency that times out `INJECTED_TIMEOUT_FAILURES` times before recovering. With `maxRetries` below that count, the failure stays visible. */
function simulateTimeout(policy: ReliabilityPolicy): ReliabilitySimResult {
  const attempts: ReliabilityAttempt[] = [];
  const maxAttempts = policy.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const backoff = attempt > 1 ? policy.backoffMs * 2 ** (attempt - 2) : 0;
    const timedOut = attempt <= INJECTED_TIMEOUT_FAILURES;
    const latencyMs = backoff + (timedOut ? TIMEOUT_LATENCY_MS : SUCCESS_LATENCY_MS);
    attempts.push({ attempt, outcome: timedOut ? "fail" : "success", latencyMs });
    if (!timedOut) break;
  }

  return { attempts, finalOutcome: finalFrom(attempts), totalLatencyMs: totalLatencyOf(attempts) };
}

/** `scenario: "provider-down"` - exercises circuit breaker (fast-fail once open) and provider fallback. The primary is ALWAYS down in this scenario. */
function simulateProviderDown(policy: ReliabilityPolicy): ReliabilitySimResult {
  const attempts: ReliabilityAttempt[] = [];
  const maxAttempts = policy.maxRetries + 1;
  let consecutiveFailures = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const breakerOpen =
      policy.circuitBreakerThreshold !== undefined && consecutiveFailures >= policy.circuitBreakerThreshold;

    if (policy.fallbackProviderId && attempt > 1) {
      // First retry after at least one primary failure routes to the configured fallback, which is healthy.
      attempts.push({ attempt, outcome: "success", latencyMs: FALLBACK_LATENCY_MS });
      break;
    }

    const latencyMs = breakerOpen ? CIRCUIT_OPEN_LATENCY_MS : PRIMARY_DOWN_LATENCY_MS;
    attempts.push({ attempt, outcome: "fail", latencyMs });
    consecutiveFailures++;
  }

  return { attempts, finalOutcome: finalFrom(attempts), totalLatencyMs: totalLatencyOf(attempts) };
}

/** `scenario: "rate-limited"` - a fast 429 rejection, then success once `backoffMs` has been waited out (visible in attempt 2's latency). */
function simulateRateLimited(policy: ReliabilityPolicy): ReliabilitySimResult {
  const attempts: ReliabilityAttempt[] = [
    { attempt: 1, outcome: "fail", latencyMs: RATE_LIMIT_REJECT_LATENCY_MS },
  ];
  if (policy.maxRetries >= 1) {
    attempts.push({ attempt: 2, outcome: "success", latencyMs: policy.backoffMs + SUCCESS_LATENCY_MS });
  }
  return { attempts, finalOutcome: finalFrom(attempts), totalLatencyMs: totalLatencyOf(attempts) };
}

/** `scenario: "duplicate-request"` - the idempotency demo: a genuine retry/duplicate of the SAME `idempotencyKey` is deduplicated instead of re-executed. */
function simulateDuplicateRequest(policy: ReliabilityPolicy): ReliabilitySimResult {
  if (!policy.idempotencyKey) {
    throw unprocessableError('policy.idempotencyKey is required for the "duplicate-request" scenario.');
  }
  const attempts: ReliabilityAttempt[] = [
    { attempt: 1, outcome: "success", latencyMs: SUCCESS_LATENCY_MS },
    { attempt: 2, outcome: "deduplicated", latencyMs: DEDUP_LOOKUP_LATENCY_MS },
  ];
  return {
    attempts,
    finalOutcome: finalFrom(attempts),
    totalLatencyMs: totalLatencyOf(attempts),
    idempotencyKey: policy.idempotencyKey,
  };
}

const QUEUE_BURST_SIZE = 10;
const QUEUE_SERVICE_TIME_MS = 50;
const QUEUE_MAX_WAIT_MS = 200;

/** `scenario: "queue-backpressure"` - a burst of `QUEUE_BURST_SIZE` requests arriving at once against `policy.queueConcurrency` worker slots. Requests whose turn would arrive after `QUEUE_MAX_WAIT_MS` are reported `"queued"` (visible backpressure) rather than silently queued forever. */
function simulateQueueBackpressure(policy: ReliabilityPolicy): ReliabilitySimResult {
  const concurrency = Math.max(1, policy.queueConcurrency ?? 1);
  const attempts: ReliabilityAttempt[] = [];

  for (let i = 0; i < QUEUE_BURST_SIZE; i++) {
    const startTime = Math.floor(i / concurrency) * QUEUE_SERVICE_TIME_MS;
    if (startTime <= QUEUE_MAX_WAIT_MS) {
      attempts.push({ attempt: i + 1, outcome: "success", latencyMs: startTime + QUEUE_SERVICE_TIME_MS });
    } else {
      attempts.push({ attempt: i + 1, outcome: "queued", latencyMs: QUEUE_MAX_WAIT_MS });
    }
  }

  const numTicks = Math.ceil(QUEUE_BURST_SIZE / concurrency);
  const queueDepthOverTime = Array.from({ length: numTicks }, (_, k) =>
    Math.max(0, QUEUE_BURST_SIZE - (k + 1) * concurrency),
  );

  const finalOutcome: "success" | "failed" = attempts.every((a) => a.outcome === "success")
    ? "success"
    : "failed";

  return {
    attempts,
    finalOutcome,
    totalLatencyMs: Math.max(...attempts.map((a) => a.latencyMs)),
    queueDepthOverTime,
  };
}

/**
 * `POST /production/reliability-sim`. Pure, deterministic, synthetic-failure
 * simulation covering all six CLAUDE.md reliability levers (retry/backoff,
 * timeouts, provider fallback, circuit breaker, idempotency, queues) across
 * these 5 scenarios - no real provider calls, so it's free and reproducible.
 */
export function runReliabilitySim(
  scenario: ReliabilityScenario,
  policy: ReliabilityPolicy,
): ReliabilitySimResult {
  switch (scenario) {
    case "timeout":
      return simulateTimeout(policy);
    case "provider-down":
      return simulateProviderDown(policy);
    case "rate-limited":
      return simulateRateLimited(policy);
    case "duplicate-request":
      return simulateDuplicateRequest(policy);
    case "queue-backpressure":
      return simulateQueueBackpressure(policy);
  }
}
