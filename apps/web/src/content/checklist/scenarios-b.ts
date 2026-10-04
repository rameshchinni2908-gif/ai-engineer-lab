import type { DesignScenario } from "../types";

/** Scenarios: multi-tenant vector search isolation, and an eval + rollout pipeline for a model upgrade. */
export const designScenariosB: DesignScenario[] = [
  {
    id: "scenario-multi-tenant-vector-isolation",
    title: "Multi-tenant vector search with strict data isolation",
    brief:
      "Design a vector search layer for a SaaS product where each customer (tenant) has its own document set. A query from one tenant must never retrieve or leak content belonging to another tenant, even in the presence of a bug in query construction. The product has a long tail of small tenants and a handful of very large ones.",
    requirements: [
      "A tenant's query can only ever retrieve that tenant's own documents",
      "A single query-construction bug must not be able to leak data across tenants",
      "The design scales from very small tenants to a few very large, high-volume tenants",
    ],
    constraints: [
      "Tenant identity must come from an authenticated session, never from client-supplied request parameters",
      "Operational overhead must stay manageable as tenant count grows into the thousands",
      "A small number of large tenants should not degrade latency for everyone else",
    ],
    referenceArchitecture: {
      summary:
        "Tenant identity is resolved server-side from an authenticated session before the RAG service ever sees a query, and vector search is scoped per tenant using a dedicated collection, with per-tenant quotas protecting against noisy neighbors.",
      nodes: [
        { id: "client", label: "Tenant's Client Application", kind: "client" },
        { id: "api-gateway", label: "API Gateway", kind: "service" },
        { id: "auth-service", label: "Tenant Auth / Context Resolver", kind: "service" },
        { id: "rag-service", label: "RAG Query Service", kind: "service" },
        { id: "embedding-service", label: "Embedding Model", kind: "model" },
        { id: "vector-store", label: "Vector DB (collection per tenant)", kind: "store" },
        { id: "tenant-config-store", label: "Tenant Config / Quota Store", kind: "store" },
        { id: "trace-store", label: "Run / Trace Store", kind: "store" },
      ],
      edges: [
        { from: "client", to: "api-gateway" },
        { from: "api-gateway", to: "auth-service", label: "resolve tenant id from authenticated session" },
        { from: "auth-service", to: "rag-service", label: "pass verified tenant context, never trust client input" },
        { from: "rag-service", to: "tenant-config-store", label: "load tenant quota/settings" },
        { from: "rag-service", to: "embedding-service" },
        { from: "rag-service", to: "vector-store", label: "query scoped to this tenant's collection only" },
        { from: "rag-service", to: "trace-store" },
      ],
    },
    keyDecisions: [
      {
        decision: "Isolation model",
        options: ["Shared collection with a tenant_id metadata filter on every query", "Separate vector-store collection per tenant", "Separate vector-store instance per tenant"],
        recommendation: "Separate collection per tenant for most tenants, with a metadata filter as a second enforcement layer even within a tenant's own collection; consider a shared collection with a mandatory, server-enforced filter only once tenant count makes per-collection overhead genuinely unmanageable.",
        rationale: "A separate collection per tenant means a query-construction bug has no cross-tenant data to leak even if the filter is wrong — the blast radius of a mistake is contained structurally, not just by a filter condition that could itself have a bug.",
      },
      {
        decision: "Where tenant scope is enforced",
        options: ["Trust a tenant id passed by the client", "Resolve tenant id server-side from the authenticated session, never from client-supplied input", "Enforce only at the vector database layer"],
        recommendation: "Resolve server-side from the authenticated session as the primary control, with the vector-store-level scoping (separate collection) as defense in depth.",
        rationale: "Any client-suppliable value is attacker-controllable by definition — tenant scoping that depends on a client-provided id is not actually isolation, it's a request to be trusted, which fails the 'must not leak even with a bug' requirement outright.",
      },
      {
        decision: "Noisy-neighbor mitigation for large tenants",
        options: ["No mitigation", "Per-tenant rate limits/quotas", "Dedicated infrastructure for the largest tenants"],
        recommendation: "Per-tenant quotas by default, with a documented upgrade path to dedicated resources for the largest tenant tier.",
        rationale: "Quotas are cheap to implement and protect the long tail of small tenants immediately; dedicated infrastructure for a handful of large tenants can be deferred until actual usage data justifies the operational cost.",
      },
    ],
    tradeoffs: [
      "A separate collection per tenant maximizes isolation guarantees but increases operational overhead (many collections to create, monitor, and migrate) as tenant count grows into the thousands.",
      "A shared collection with a metadata filter scales operationally better but means a single filter-construction bug has a much larger blast radius — it can leak across every tenant in that collection, not just one.",
      "Per-tenant quotas prevent noisy-neighbor degradation but require ongoing capacity planning per tenant tier rather than a single uniform capacity model.",
    ],
    rubric: [
      { criterion: "Isolation enforcement location", good: "Resolves tenant identity server-side from an authenticated session and never trusts client-supplied tenant parameters", bad: "Accepts a tenant id as a client-supplied request parameter and uses it directly in the query" },
      { criterion: "Blast radius of a single bug", good: "Chooses an isolation model (e.g. separate collections) where a filter-construction mistake can't leak data across tenants", bad: "Relies solely on a correctly-written filter in a shared collection with no structural backstop" },
      { criterion: "Noisy neighbor handling", good: "Addresses how a few large tenants won't degrade service for smaller ones", bad: "Doesn't address capacity planning across very different tenant sizes" },
      { criterion: "Testability", good: "Describes how cross-tenant leakage would actually be tested (e.g. automated two-tenant leak tests)", bad: "Asserts isolation is guaranteed with no described way to verify it" },
    ],
    relatedModules: ["embeddings", "security", "production"],
  },
  {
    id: "scenario-model-upgrade-eval-rollout",
    title: "An eval and rollout pipeline for a model version upgrade",
    brief:
      "A new version of the model powering a production feature has become available. Design the pipeline that decides whether to adopt it and how to roll it out safely, given that the new version could change behavior in ways the team hasn't anticipated.",
    requirements: [
      "The decision to adopt the new model version is based on measured evidence, not a subjective impression",
      "Any rollout can be automatically or immediately rolled back if live metrics regress",
      "The comparison between the old and new version is fair, not biased by judge selection",
    ],
    constraints: [
      "The new model version may differ meaningfully from the current one in ways not caught by a quick manual spot-check",
      "Production traffic can't be fully cut over without validation, given real user impact of a regression",
      "The evaluation and rollout need to be repeatable for future model upgrades, not a one-off manual effort",
    ],
    referenceArchitecture: {
      summary:
        "An offline eval compares the baseline and candidate model versions against a golden dataset using a third-party judge, gates promotion through a CI-style threshold check, then a canary router exposes the candidate to a small slice of live traffic with automated rollback on regression.",
      nodes: [
        { id: "engineer-client", label: "Engineer Triggering the Upgrade Evaluation", kind: "client" },
        { id: "eval-service", label: "Eval Service", kind: "service" },
        { id: "golden-dataset-store", label: "Golden Dataset Store", kind: "store" },
        { id: "baseline-model", label: "Baseline (current production) Model", kind: "model" },
        { id: "candidate-model", label: "Candidate (new) Model Version", kind: "model" },
        { id: "judge-model", label: "LLM Judge (different family than candidates)", kind: "model" },
        { id: "ci-gate", label: "CI Regression Gate", kind: "service" },
        { id: "canary-router", label: "Canary Traffic Router", kind: "service" },
        { id: "production-traffic", label: "Live Production Traffic", kind: "external" },
        { id: "rollback-controller", label: "Rollback Controller", kind: "service" },
        { id: "trace-store", label: "Run / Trace Store", kind: "store" },
      ],
      edges: [
        { from: "engineer-client", to: "eval-service", label: "trigger baseline vs candidate comparison" },
        { from: "eval-service", to: "golden-dataset-store", label: "load evaluation cases" },
        { from: "eval-service", to: "baseline-model", label: "run baseline variant" },
        { from: "eval-service", to: "candidate-model", label: "run candidate variant" },
        { from: "eval-service", to: "judge-model", label: "score both variants" },
        { from: "eval-service", to: "ci-gate", label: "check scores against thresholds" },
        { from: "ci-gate", to: "canary-router", label: "gate passed, authorize canary" },
        { from: "canary-router", to: "production-traffic", label: "route a small percentage to candidate" },
        { from: "canary-router", to: "rollback-controller", label: "report live canary metrics" },
        { from: "rollback-controller", to: "canary-router", label: "trigger rollback if thresholds breached" },
        { from: "eval-service", to: "trace-store" },
      ],
    },
    keyDecisions: [
      {
        decision: "Judge model selection for the offline comparison",
        options: ["Use a judge from the same model family as either candidate", "Use a judge from a third, unrelated model family", "Use multiple judges and triangulate"],
        recommendation: "A judge from a third, unrelated model family as the primary signal, with human spot-checking on a sample.",
        rationale: "If the judge shares a family with either the baseline or candidate, self-enhancement bias systematically favors that model, undermining the fairness requirement the comparison explicitly needs.",
      },
      {
        decision: "What live canary metrics gate promotion to full rollout",
        options: ["Error rate only", "Error rate, cost per request, and a quality proxy (e.g. thumbs-down rate or a sampled eval-equivalent check), tracked together", "No live metrics — rely entirely on the offline eval score"],
        recommendation: "Track error rate, cost per request, and a quality proxy together, with explicit pre-defined thresholds for each.",
        rationale: "The offline eval validates quality against known cases, but only live metrics catch real-traffic surprises (distribution shift, edge cases the dataset didn't anticipate) the offline eval structurally cannot see.",
      },
      {
        decision: "Rollout pacing",
        options: ["Immediate 100% cutover once the offline gate passes", "A fixed small-percentage canary for a fixed duration, then full cutover", "A gradual percentage ramp, automatically promoted only while metrics stay healthy"],
        recommendation: "A gradual ramp with automated promotion gated on sustained healthy metrics, and automatic rollback on any threshold breach.",
        rationale: "A fixed-duration canary either ends too early (not enough signal) or delays benefit unnecessarily if the model is clearly healthy — a metrics-gated ramp adapts the pace to the actual evidence instead of a fixed clock.",
      },
    ],
    tradeoffs: [
      "A gradual ramp is safer than a fixed-duration canary but delays realizing the new model's benefits (quality or cost improvements) longer if the model is in fact healthy.",
      "Tracking more live metrics (cost, quality proxy, not just error rate) gives a better rollback signal but adds real monitoring and alerting infrastructure to build and maintain.",
      "Using a third-family judge avoids self-enhancement bias but introduces a new judge whose own calibration and biases need separate validation against human judgment before being trusted.",
    ],
    rubric: [
      { criterion: "Judge bias awareness", good: "Explicitly selects a judge model unrelated to either compared model and validates it against human judgment", bad: "Uses a judge from the same family as one of the compared models with no discussion of bias" },
      { criterion: "Rollback trigger concreteness", good: "Defines specific, pre-agreed metrics and thresholds that trigger rollback", bad: "Says rollout will be 'monitored' with no concrete trigger defined" },
      { criterion: "Rollout pacing rationale", good: "Justifies the chosen pacing (gradual ramp, fixed canary, etc.) against the actual risk profile of this change", bad: "Proposes an immediate full cutover once the offline eval passes, with no live validation" },
      { criterion: "Offline/online separation", good: "Treats the offline eval gate and live canary monitoring as two necessary, complementary checks, neither sufficient alone", bad: "Relies on only one of the two (offline eval only, or live monitoring only) as if it were sufficient by itself" },
    ],
    relatedModules: ["evals", "production", "fundamentals"],
  },
];
