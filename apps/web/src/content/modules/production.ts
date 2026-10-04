import type { ModuleContent } from "../types";

export const productionContent: ModuleContent = {
  moduleId: "production",
  learn: {
    moduleId: "production",
    summary: {
      beginner:
        "Running an LLM feature in production costs real money and takes real time per request. This module measures four concrete ways to cut cost and latency — caching, routing, batching, and trimming context — and shows how systems stay reliable when a provider has a bad day.",
      intermediate:
        "Observability (traces, cost/latency per run) is what makes any of these levers measurable instead of guessed. Caching, routing, batching, and context trimming each target a different part of the cost equation and compose together rather than substitute for each other.",
      senior:
        "Every 'savings' number in this module comes from actually running the requests twice (cold vs. simulated-optimized) and measuring, not a hand-wavy multiplier — treat any cost-optimization claim elsewhere that doesn't show its measurement methodology with the same skepticism. Reliability levers (retry/backoff, circuit breaker, idempotency, queueing) solve different failure shapes and are not interchangeable substitutes for each other.",
    },
    explain: [
      {
        heading: "Four concrete cost levers, measured not guessed",
        body: "Caching (prompt/semantic/response) avoids recomputation for repeated or similar requests. Model routing sends easy requests to cheaper models. Batching amortizes fixed overhead across grouped requests. Context trimming reduces the input tokens actually billed and processed. Each has its own sim endpoint in this module that runs requests for real (or through the mock provider) and reports measured before/after cost and latency — not an assumed percentage.",
      },
      {
        heading: "Observability means every run is individually explainable",
        body: "Every generation endpoint across every module persists a `Run` with its params, usage, cost, latency, and model — the `/production/cost-summary` and `GET /traces` views aggregate this real data, so a cost spike or latency regression can be traced back to specific requests, not just observed as an unexplained trend line.",
      },
      {
        heading: "Reliability is about failure shape, not one generic 'retry harder'",
        body: "A timeout needs retry-with-backoff; a sustained outage needs a circuit breaker so you stop hammering a dead dependency; an ambiguous-failure retry needs idempotency so it doesn't double-execute a side effect; a burst of concurrent demand needs queueing with bounded depth. `/production/reliability-sim` lets you inject each failure scenario and see which policy actually handles it.",
      },
    ],
    underTheHood: [
      {
        heading: "Cache/batching/routing simulations run real requests, twice",
        body: "`/production/cache-sim` and `/production/batching-sim` measure savings by actually executing the requests through the selected provider under both the unoptimized and optimized condition and comparing real totals — this is explicitly required so the demonstrated savings are measured, not an assumed multiplier that could mislead about real-world impact.",
      },
      {
        heading: "Idempotency and queueing are both covered by one reliability-sim endpoint",
        body: "`scenario: 'duplicate-request'` replays the same `idempotencyKey` and reports an outcome of `deduplicated` instead of re-executing; `scenario: 'queue-backpressure'` caps in-flight work via `queueConcurrency` and samples `queueDepthOverTime`, covering all six CLAUDE.md-mandated reliability levers (retry/backoff, timeouts, fallback, circuit breaker, idempotency, queues) in one simulated, deterministic, synthetic-failure endpoint — no real provider calls needed.",
      },
      {
        heading: "Context trimming reuses M1's trimming service, doesn't reimplement it",
        body: "`/production/context-trim-sim` is explicitly specified to reuse the pure trimming function already built for `/fundamentals/context-window` rather than reimplementing truncation logic — a reminder that the same mechanism (truncate-oldest/middle, sliding-window, summarize) serves both a correctness use case (fitting a conversation) and a cost use case (reducing billed input tokens).",
      },
    ],
    seniorGotchas: [
      {
        heading: "A cache hit rate assumption is not a cache hit rate measurement",
        body: "It's tempting to multiply cost by an assumed cache hit percentage from a blog post; this module's `/production/cache-sim` deliberately runs real requests to produce a measured number instead, because assumed hit rates routinely diverge from what a specific workload's actual query repetition looks like.",
      },
      {
        heading: "Retry-with-backoff without idempotency can double-execute side effects",
        body: "A timeout doesn't tell you whether the original request succeeded or not — blindly retrying a non-idempotent action (charge, send) on an ambiguous failure risks doing it twice. Idempotency keys are not optional hardening for anything with a real side effect; they're required alongside any retry policy.",
      },
      {
        heading: "Unbounded queues delay an overload problem instead of solving it",
        body: "A queue with no depth cap just postpones failure (and risks memory exhaustion) rather than shedding load gracefully — a production-grade queue bounds its depth and fails fast once full, rather than accepting unlimited backlog.",
      },
      {
        heading: "Canary and shadow deployments answer different questions and aren't substitutes",
        body: "Shadowing gives real-traffic signal with zero user-facing risk but can't observe real user reaction (no one sees the shadow's output); canarying exposes real risk to a small slice but captures real user-facing signal a shadow never can. Treat shadow as a pre-canary validation step, not a replacement for it.",
      },
    ],
  },
  pitfalls: [
    {
      id: "production-assumed-cache-hit-rate",
      title: "Projected cost savings from caching don't materialize in production",
      symptom: "A cost model assumed a 60% cache hit rate, but actual production savings are much lower.",
      cause: "The hit-rate assumption was copied from a generic estimate rather than measured against this workload's actual query repetition pattern.",
      fix: "Measure actual cache hit rate against representative real traffic (as `/production/cache-sim` does by running requests for real) before committing to a savings projection in a budget or capacity plan.",
      severity: "medium",
    },
    {
      id: "production-retry-without-idempotency",
      title: "A timeout-triggered retry causes a duplicate side effect",
      symptom: "A user is charged twice, or an email is sent twice, after a single ambiguous timeout.",
      cause: "Retry-with-backoff was implemented without an idempotency key, so the retry had no way to recognize 'this exact operation may have already succeeded' before re-executing it.",
      fix: "Always pair retries on non-idempotent operations with an idempotency key the server can use to detect and skip duplicate execution, returning the original result instead.",
      severity: "high",
    },
    {
      id: "production-unbounded-queue-memory",
      title: "A burst of concurrent requests causes an out-of-memory crash instead of graceful degradation",
      symptom: "During a traffic spike, the service crashes rather than slowing down or rejecting excess requests.",
      cause: "The request queue had no bounded depth — it kept accepting and holding work indefinitely instead of shedding load once a safe limit was reached.",
      fix: "Cap queue depth explicitly and return a clear rejection (e.g. 429/503) once the cap is hit, rather than letting an unbounded queue grow until memory runs out.",
      severity: "high",
    },
    {
      id: "production-shadow-as-canary-substitute",
      title: "A shadow-only validation misses a real user-facing regression",
      symptom: "A new model version passed shadow testing cleanly but caused a user-facing quality complaint once fully rolled out.",
      cause: "Shadow deployment was treated as sufficient validation on its own, but it never exposes the shadow's output to real users, so it can't detect regressions that only manifest in actual user reaction/behavior.",
      fix: "Use shadow deployment as a pre-canary sanity check, then still run a real canary with live traffic and monitoring before a full rollout.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "production-q1",
      question: "Why does this module's cache-sim endpoint actually run requests twice instead of applying an assumed hit-rate multiplier?",
      options: [
        "Because running requests twice is required by the SSE protocol",
        "Because CLAUDE.md requires measured savings, not hand-wavy multipliers — an assumed hit rate can diverge significantly from a specific workload's real repetition pattern",
        "Because the mock provider cannot compute cost any other way",
        "There's no real reason; it's just slower for no benefit",
      ],
      correctIndex: 1,
      explanation: "The spec explicitly calls for 'measured savings' from actually running requests through the provider twice (cold vs. simulated-cache), specifically because assumed multipliers are a common way cost projections turn out to be wrong once deployed against real traffic.",
      difficulty: "intermediate",
    },
    {
      id: "production-q2",
      question: "A service retries a payment request after a timeout, without an idempotency key. What's the risk?",
      options: [
        "No risk — retries are always safe regardless of the operation",
        "The original request may have actually succeeded despite the timeout, so the retry could cause the payment to be charged twice",
        "The retry will always fail cleanly with a duplicate-request error automatically",
        "Idempotency keys are only relevant for GET requests",
      ],
      correctIndex: 1,
      explanation: "A timeout means you don't know whether the original request succeeded on the server side. Without an idempotency key letting the server recognize and deduplicate the retry, a non-idempotent action like a charge can be executed twice.",
      difficulty: "senior",
    },
    {
      id: "production-q3",
      question: "What's the key difference between a circuit breaker and retry-with-backoff?",
      options: [
        "They are two names for the exact same pattern",
        "Retry-with-backoff handles isolated transient failures by waiting and trying again; a circuit breaker handles sustained outages by stopping requests entirely for a cooldown period",
        "Circuit breakers are only used for database connections, never LLM calls",
        "Retry-with-backoff requires more memory than a circuit breaker",
      ],
      correctIndex: 1,
      explanation: "Retries with backoff are designed for brief, isolated failures where trying again shortly after is likely to succeed. A circuit breaker is designed for sustained failures, protecting both the caller and the struggling dependency by stopping traffic entirely until a cooldown passes and trial requests confirm recovery.",
      difficulty: "intermediate",
    },
    {
      id: "production-q4",
      question: "Why is an unbounded request queue dangerous during a traffic spike?",
      options: [
        "It isn't dangerous — queues should always accept unlimited work to avoid rejecting users",
        "It just delays an overload problem (and risks memory exhaustion) rather than shedding load gracefully once capacity is exceeded",
        "Unbounded queues automatically convert to batched requests",
        "Queue depth has no relationship to memory usage",
      ],
      correctIndex: 1,
      explanation: "A queue with no depth cap keeps accepting work it can't actually process in time, which both delays the eventual failure and risks exhausting memory. A production-grade queue bounds its depth and fails fast (sheds load) once full.",
      difficulty: "intermediate",
    },
    {
      id: "production-q5",
      question: "A new model version passes shadow-deployment validation with no issues, but a real canary rollout surfaces a user-facing regression. What does this reveal about shadow deployments?",
      options: [
        "Shadow deployments are useless and should never be used",
        "Shadow deployment gives real-traffic input/output comparison with zero user risk, but can't observe actual user reaction since users never see the shadow's output — it's a pre-canary check, not a substitute for canarying",
        "This outcome means the shadow deployment was configured incorrectly",
        "Canary deployments are strictly worse than shadow deployments in every case",
      ],
      correctIndex: 1,
      explanation: "Shadowing and canarying answer different questions: shadowing is safe but blind to real user reaction; canarying exposes real (small) risk but captures genuine user-facing signal. A regression surfacing only in canary, not shadow, is exactly the gap shadow deployment cannot cover on its own.",
      difficulty: "senior",
    },
  ],
  presets: [
    {
      id: "production-cache-types-compared",
      label: "Prompt vs semantic vs response caching on the same request set",
      description: "Run an identical batch of requests (with some paraphrased repeats) through all three cache types and compare measured hit rate, cost, and latency savings.",
    },
    {
      id: "production-routing-cheapest-vs-complexity",
      label: "Cheapest-model routing vs complexity-based routing",
      description: "Route a mixed batch of simple and complex requests under both strategies and compare total cost against the single-expensive-model baseline.",
    },
    {
      id: "production-reliability-scenario-tour",
      label: "Walk through all five reliability scenarios",
      description: "Trigger timeout, provider-down, rate-limited, duplicate-request, and queue-backpressure scenarios one at a time and compare how each configured policy responds.",
    },
    {
      id: "production-context-trim-savings",
      label: "Context trimming savings on an overlong conversation",
      description: "Run the same long conversation through context-trim-sim with each trimming strategy and compare measured token/cost savings against the untrimmed baseline.",
    },
  ],
};
