import type { ModuleContent } from "../types";

export const structuredContent: ModuleContent = {
  moduleId: "structured",
  learn: {
    moduleId: "structured",
    summary: {
      beginner:
        "Sometimes you need the model to output data your code can parse reliably — like JSON — instead of free-form prose. Structured output and tool calling make that possible.",
      intermediate:
        "JSON mode guarantees valid syntax, but not a correct schema; schema validation plus repair loops close that gap. Tool/function calling turns the model into a dispatcher that requests actions your code actually executes and validates before anything happens.",
      senior:
        "Treat every layer of structured output as a probabilistic guarantee with a specific scope: constrained decoding guarantees syntax, not semantics; a schema-valid tool call can still carry hallucinated argument values. Never execute a tool call's side effects without validating arguments against expectations first, regardless of how 'constrained' the generation was upstream.",
    },
    explain: [
      {
        heading: "JSON mode vs full schema validation are different guarantees",
        body: "JSON mode (or constrained decoding more broadly) ensures the output is syntactically valid JSON — balanced braces, proper quoting — by masking invalid tokens during generation. It says nothing about whether the right fields are present with the right types; that's a separate validation step your code must always run afterward.",
      },
      {
        heading: "Schema repair turns a validation failure into a second chance",
        body: "When generated JSON fails schema validation, instead of just failing, you can feed the specific validation errors back to the model and ask it to fix them. This app's `/structured/repair` route does exactly that, chaining attempts via `parentRunId` and capping the number of tries — unbounded repair loops are a real cost risk.",
      },
      {
        heading: "Tool calling is a round-trip your code controls, not the model",
        body: "When a model 'calls a tool,' it's really just emitting a structured request. Your application code decides whether to actually execute it, what to pass through, and what result to send back — the model never has real side effects on its own. This is exactly why tool argument validation before execution is non-negotiable.",
      },
    ],
    underTheHood: [
      {
        heading: "Constrained decoding masks invalid tokens before sampling",
        body: "Rather than generating freely and checking afterward, constrained decoding intersects the model's probability distribution with the set of tokens that keep the output grammatically valid at every single step — an invalid token literally cannot be sampled. This is a much stronger guarantee than a 'please output JSON' instruction, but it's purely syntactic: it has no opinion on whether a field's value is factually correct.",
      },
      {
        heading: "finishReason determines whether a parse failure is truncation or malformation",
        body: "`/structured/generate` surfaces the provider-reported `finishReason` alongside `output.parsedJson`. A parse failure caused by hitting `max_tokens` mid-object needs a completely different fix (raise the token limit) than one caused by the model genuinely emitting invalid structure — always check finishReason before assuming which problem you're looking at.",
      },
      {
        heading: "Parallel tool calls need explicit partial-failure handling",
        body: "When a model requests multiple tool calls in one turn, your execution layer runs them (often concurrently) and has to decide explicitly what happens to the group if one call fails — continue with partial results, fail the whole turn, or retry just the failed one. This is an application design decision, not something the model or the protocol decides for you.",
      },
    ],
    seniorGotchas: [
      {
        heading: "A schema-valid tool call can still carry hallucinated arguments",
        body: "The model generating well-formed, schema-conformant arguments says nothing about whether those argument *values* are correct — a perfectly structured `{\"amount\": 50000, \"account\": \"acct_123\"}` can still be a completely fabricated amount. Validate argument values against business rules, not just shape, before executing anything with real consequences.",
      },
      {
        heading: "Repair loops need a hard cap and a defined fallback",
        body: "Every repair attempt is a real, billed LLM call — an unbounded 'keep trying until it's valid' loop is a cost and latency risk with no guaranteed termination. Cap `maxAttempts` explicitly and decide up front what happens when the cap is hit: return an error, use a safe default, or escalate to a human.",
      },
      {
        heading: "JSON mode's guarantee doesn't survive being wrapped in prose",
        body: "If a prompt loosely asks for 'JSON, maybe with a brief explanation first,' some models will happily wrap the JSON in markdown fences or add commentary even with JSON mode enabled, depending on provider semantics — read the specific provider's JSON mode documentation rather than assuming universal behavior across providers.",
      },
      {
        heading: "Grammar-based decoding is more powerful and more fragile to author",
        body: "A hand-written grammar (GBNF or similar) that has a subtle error can make certain valid outputs structurally unreachable, failing silently rather than loudly — test a grammar against known-good examples before trusting it in production, not just against the happy path you had in mind while writing it.",
      },
    ],
  },
  pitfalls: [
    {
      id: "structured-trusting-json-mode-alone",
      title: "JSON mode enabled, but downstream code crashes on missing fields",
      symptom: "The response is always valid JSON, but required fields are intermittently missing or have the wrong type.",
      cause: "JSON mode only guarantees syntactic validity, not schema conformance — the team treated 'parses as JSON' as equivalent to 'matches our schema.'",
      fix: "Always run the output through `/structured/validate` against the actual target schema, and handle validation failures explicitly (reject, repair, or default) rather than assuming JSON-mode output is schema-correct.",
      severity: "high",
    },
    {
      id: "structured-unbounded-repair",
      title: "A repair loop runs far more attempts than expected, inflating cost",
      symptom: "A single malformed response ends up costing 8-10x a normal call because repair kept retrying.",
      cause: "`maxAttempts` wasn't set (or was set too high), and the model kept producing subtly-invalid variants that each triggered another repair call.",
      fix: "Cap maxAttempts to a small number (2-3), log every attempt's validation errors, and define an explicit fallback behavior for when the cap is reached instead of retrying indefinitely.",
      severity: "medium",
    },
    {
      id: "structured-tool-call-unvalidated-execution",
      title: "A tool call executes with a nonsensical argument value",
      symptom: "A calculator or lookup tool is called with an argument that's syntactically valid but semantically wrong (e.g. a negative quantity for a purchase).",
      cause: "The application executed the tool call immediately after schema validation passed, without any business-rule validation on the actual argument values.",
      fix: "Add a validation layer between 'schema-valid tool call' and 'execute it' that checks domain-specific constraints (ranges, allowed values, cross-field consistency) before any side effect runs.",
      severity: "high",
    },
    {
      id: "structured-finish-reason-ignored",
      title: "Truncated structured output is debugged as a parsing bug",
      symptom: "JSON parsing fails intermittently on longer responses, and the team spends time 'fixing' the parser.",
      cause: "The response was cut off by hitting `max_tokens` (finishReason indicates length), not actually malformed — the parser was never the problem.",
      fix: "Check `finishReason` before investigating a parse failure; if it's a length cutoff, raise max_tokens or reduce the requested output size instead of touching parsing logic.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "structured-q1",
      question: "A model returns syntactically perfect JSON with JSON mode enabled, but a required field is missing. What does this tell you?",
      options: [
        "JSON mode is broken and should be disabled",
        "This is expected — JSON mode guarantees syntax validity only, not schema conformance, so you still need separate schema validation",
        "The schema itself must be malformed",
        "This can never happen if JSON mode is enabled correctly",
      ],
      correctIndex: 1,
      explanation: "JSON mode constrains decoding to produce syntactically valid JSON by masking invalid tokens, but it has no awareness of your specific schema's required fields or types. Schema validation is always a necessary separate step.",
      difficulty: "beginner",
    },
    {
      id: "structured-q2",
      question: "Why does an unbounded schema-repair loop pose a real production risk?",
      options: [
        "Because repair attempts are free but slow",
        "Because each repair attempt is a full, billed LLM call, and an uncapped loop can keep retrying indefinitely on a model that keeps producing subtly-invalid output",
        "Because repair loops can never actually fix invalid JSON",
        "Because repair loops only run in mock mode",
      ],
      correctIndex: 1,
      explanation: "Each repair attempt is its own real LLM call with real cost and latency. Without a maxAttempts cap and a defined fallback for when it's reached, a persistently-invalid model response can trigger far more spend and delay than a single request should ever cause.",
      difficulty: "intermediate",
    },
    {
      id: "structured-q3",
      question: "A tool call for 'transfer_funds' comes back with valid schema-conformant arguments: amount=999999999, account='acct_1'. What's the correct next step?",
      options: [
        "Execute it immediately, since schema validation already passed",
        "Validate the argument values against business rules (reasonable amount ranges, account existence/ownership) before executing anything with real consequences",
        "Reject it automatically because large numbers are always suspicious",
        "Ask the model to re-generate the same call a second time for confirmation",
      ],
      correctIndex: 1,
      explanation: "Schema validation only confirms shape and type, not business correctness. A model can produce a perfectly well-formed but completely wrong or hallucinated argument value — real-consequence tool calls need domain-specific validation on top of schema validation, every time.",
      difficulty: "senior",
    },
    {
      id: "structured-q4",
      question: "What distinguishes constrained decoding from a prompt that simply asks the model to 'please output valid JSON'?",
      options: [
        "There is no real difference — both rely entirely on the model's willingness to comply",
        "Constrained decoding masks invalid tokens at the sampling level, making invalid output structurally impossible to generate, not just discouraged by instruction",
        "Constrained decoding is slower but otherwise identical in guarantees",
        "Constrained decoding only works with the mock provider",
      ],
      correctIndex: 1,
      explanation: "A prompt instruction is a request the model can still fail to follow. Constrained decoding operates at the token-sampling level, intersecting the model's distribution with only the tokens that keep the output grammatically valid — it's a structural guarantee, not a politely-worded hope.",
      difficulty: "intermediate",
    },
    {
      id: "structured-q5",
      question: "A structured-output response fails to parse as JSON. The response metadata shows finishReason: 'length'. What's the right fix?",
      options: [
        "Rewrite the JSON parser to be more lenient",
        "Switch to a different model entirely",
        "Raise max_tokens (or shrink the prompt/schema) since the response was cut off before completion, not malformed by the model's choice",
        "Add more few-shot examples to the prompt",
      ],
      correctIndex: 2,
      explanation: "finishReason: 'length' means the response hit the token limit mid-generation — it's a budget problem, not a parsing or prompting problem. The JSON is incomplete because it was cut off, and no amount of lenient parsing or extra examples fixes that; only more budget (or a smaller target output) does.",
      difficulty: "intermediate",
    },
  ],
  presets: [
    {
      id: "structured-json-mode-vs-schema",
      label: "JSON mode vs full schema-constrained generation",
      description: "Run the same request under plain JSON mode and under schema-constrained decoding, and compare how often each produces a fully schema-valid result.",
    },
    {
      id: "structured-repair-attempts",
      label: "Deliberately invalid JSON, watch repair converge",
      description: "Feed intentionally broken JSON into the repair pipeline and step through each repair attempt's stage event to see the validation errors shrink toward zero (or hit maxAttempts).",
    },
    {
      id: "structured-parallel-tool-calls",
      label: "A request that triggers 3 parallel tool calls",
      description: "Ask a question that requires three independent lookups at once and inspect how tool_call/tool_result events are multiplexed on one SSE connection.",
    },
    {
      id: "structured-malformed-tool-args",
      label: "Forced tool call with a deliberately out-of-range argument",
      description: "Trigger a tool call whose generated argument value is schema-valid but business-rule-invalid, to see why argument validation has to happen before execution.",
    },
  ],
};
