import type { ModuleContent } from "../types";

export const fundamentalsContent: ModuleContent = {
  moduleId: "fundamentals",
  learn: {
    moduleId: "fundamentals",
    summary: {
      beginner:
        "LLMs don't read words — they read tokens, small chunks of text converted to numbers. A 'context window' is how many tokens fit in one request. Sampling settings like temperature control how predictable or surprising the output is.",
      intermediate:
        "Tokenization, context budgeting, and sampling parameters (temperature, top_p, top_k, penalties, seed) are the knobs that determine cost, latency, and output variability for every single request. Logprobs let you see the model's actual confidence at each token, not just the text it picked.",
      senior:
        "Treat tokenization as provider-specific and non-portable; treat context budget as a hard constraint shared across system prompt, history, tools, and retrieved content; treat 'determinism' on hosted multi-tenant providers as best-effort, not guaranteed. TTFT (prefill-bound) and tokens/sec (decode-bound) are different latency metrics driven by different bottlenecks and should never be collapsed into a single 'response time' number.",
    },
    explain: [
      {
        heading: "Tokens are the real unit of cost and context",
        body: "Before a model sees your prompt, a tokenizer splits it into sub-word pieces (tokens) and maps each to an integer id. Billing, context limits, and generation speed are all measured in tokens, not characters or words — a short-looking prompt in a token-dense language or with lots of code/punctuation can cost noticeably more tokens than its character count suggests.",
      },
      {
        heading: "The context window is one shared budget",
        body: "System prompt + conversation history + tool definitions + retrieved documents + the model's own output all draw from the same fixed token budget. Run out, and you either get a hard error or silent truncation, depending on how the client handles it — this app's `/fundamentals/context-window` endpoint lets you see exactly which messages get dropped under each strategy (truncate-oldest, truncate-middle, sliding-window, summarize).",
      },
      {
        heading: "Sampling parameters reshape a probability distribution, they don't add magic randomness",
        body: "At each step the model produces a score (logit) for every possible next token. Temperature rescales those scores before converting them to probabilities; top_p and top_k then narrow which tokens are even eligible to be sampled. Turning the temperature dial from 0 toward 1.2 on the exact same prompt is the clearest way to see this: watch how the logprobs panel shows a narrow, confident distribution becoming a much wider one.",
      },
    ],
    underTheHood: [
      {
        heading: "Autoregressive decoding, one token at a time",
        body: "The model generates output left to right: it computes a distribution over the next token, something (greedy argmax or sampling) picks one, that token gets appended to the sequence, and the whole thing repeats. This is why streaming exists and why decode throughput (tokens/sec) is inherently sequential, while the initial prompt processing (prefill, driving time-to-first-token) can be done in parallel across all input tokens at once.",
      },
      {
        heading: "KV cache: why TTFT and tokens/sec behave so differently",
        body: "Self-attention needs every prior token's key/value projections at every step; recomputing them from scratch each time would be quadratically expensive, so they're cached. Prefill builds that cache for the entire prompt in one parallel pass (cost scales with prompt length), while decode reuses and extends the cache one token at a time (cost scales with how many tokens you ask for) — this is the structural reason a huge RAG context can feel slow to even start (TTFT) while a short prompt asking for a long essay feels slow to finish (tokens/sec).",
      },
      {
        heading: "What a seed actually controls in the mock provider",
        body: "This app's MockProvider is contractually required to be deterministic given (model, messages, params.seed) — same inputs, same output, every time, with zero API keys. It also has to visibly react to temperature/top_p/top_k by varying which of a small deterministic candidate set gets chosen and by widening logprobs.topAlternatives, specifically so the 'change temperature, see token-probability shifts' demo works with no provider configured.",
      },
    ],
    seniorGotchas: [
      {
        heading: "Hosted-provider 'determinism' is best-effort",
        body: "Setting temperature=0 and a fixed seed on a hosted provider reduces variance but is not a cryptographic guarantee of bit-identical output — batching, routing, and backend kernel differences can still shift results run to run. Never build a test assertion or a billing-critical comparison on the assumption of exact hosted-provider reproducibility; use mock mode or a local model for anything that truly must be deterministic.",
      },
      {
        heading: "Your token count is an estimate until you use the real tokenizer",
        body: "Counting words or characters to predict context usage is wrong by a large and inconsistent margin across languages and content types. Worse, different model families tokenize differently, so a token budget tuned against one model's tokenizer can silently overflow on another — always tokenize client-side (or trust the server's `/fundamentals/tokenize` call) with the actual target model before trusting any budget math.",
      },
      {
        heading: "Context window size is volatile — don't hardcode it from memory",
        body: "Context window limits change across model versions and providers, and providers occasionally revise them. Treat any specific number as 'check provider docs for current values' rather than a fact you memorized once; a hardcoded limit baked into application logic is a latent bug waiting for the next model update.",
      },
      {
        heading: "top_k and top_p interact, they are not independent switches",
        body: "Setting a low top_p while also setting a high top_k (or vice versa) means one of them is doing nothing — whichever constraint is tighter at a given step wins, and providers don't standardize the order of application. Tune and test them together against your actual task, not as two unrelated sliders.",
      },
    ],
  },
  pitfalls: [
    {
      id: "fundamentals-token-estimate",
      title: "Character-count token budgeting silently overflows context",
      symptom: "A request that 'should' fit comfortably gets truncated or rejected as too long.",
      cause: "The app estimated tokens from character or word count instead of the model's actual tokenizer, undercounting by a wide and inconsistent margin (especially for code, non-English text, or heavy punctuation).",
      fix: "Call the real tokenizer (this app's `/fundamentals/tokenize`) for the exact target model before computing any budget, and re-check the budget whenever the model changes.",
      severity: "high",
    },
    {
      id: "fundamentals-determinism-assumption",
      title: "'Deterministic' hosted-provider calls occasionally produce different output",
      symptom: "The same seed and temperature=0 request intermittently returns slightly different text days apart.",
      cause: "Hosted multi-tenant providers offer best-effort determinism, not a guarantee — backend routing, batching, and kernel/precision changes can shift results even with a fixed seed.",
      fix: "Don't build correctness-critical logic on hosted-provider determinism; use the MockProvider or a local model for anything requiring guaranteed reproducibility, and treat hosted determinism as a variance-reduction feature, not a contract.",
      severity: "medium",
    },
    {
      id: "fundamentals-context-budget-shared",
      title: "Tool definitions and system prompt quietly eat the context budget",
      symptom: "A long conversation that worked fine starts getting truncated earlier than expected after tools were added.",
      cause: "The context window is one shared budget across the system prompt, tool definitions, conversation history, and output — every tool schema added to a request counts against the same limit as the conversation itself.",
      fix: "Measure total tokens including tool definitions and system prompt, not just the user-visible conversation, and budget headroom explicitly for them.",
      severity: "medium",
    },
    {
      id: "fundamentals-finish-reason-ignored",
      title: "Malformed structured output is actually just truncation",
      symptom: "A JSON response fails to parse because it cuts off mid-object.",
      cause: "`max_tokens` was reached before the model finished, and the code never checked `finishReason` before trying to parse — it assumed every response was complete.",
      fix: "Always check `finishReason` first; if it indicates a length cutoff, raise `max_tokens` or shrink the prompt rather than treating it as a pure parsing bug.",
      severity: "high",
    },
    {
      id: "fundamentals-stop-sequence-collision",
      title: "A stop sequence truncates legitimate output",
      symptom: "Generated code or text is cut off right after a string that matches the configured stop sequence appears mid-content.",
      cause: "The chosen stop sequence (e.g. a delimiter string) can also legitimately occur inside the desired output, such as inside a code sample.",
      fix: "Choose stop sequences unlikely to appear in valid content (uncommon unicode markers, multi-character unlikely strings), and test against realistic output samples before relying on them.",
      severity: "low",
    },
  ],
  quiz: [
    {
      id: "fundamentals-q1",
      question: "A prompt has 40 words. Why might it consume significantly more than 40 tokens?",
      options: [
        "Tokenizers always split every word into exactly 2 tokens",
        "Punctuation, code, non-English text, and rare words commonly split into multiple sub-word tokens",
        "The context window rounds every request up to the next 100 tokens",
        "Token count only matters for the output, not the input",
      ],
      correctIndex: 1,
      explanation: "Sub-word tokenizers (like BPE) split uncommon words, code, and non-English text into multiple tokens because those sequences weren't common enough to earn their own single token in the vocabulary. Word count is not a reliable proxy for token count.",
      difficulty: "beginner",
    },
    {
      id: "fundamentals-q2",
      question: "You set temperature=0 and a fixed seed on a hosted provider and run the same request twice. What should you expect?",
      options: [
        "Bit-for-bit identical output, guaranteed by contract",
        "Usually very similar or identical output, but not an absolute guarantee due to backend batching/routing/kernel variance",
        "Completely random output every time, since seed only affects top_p",
        "An error, because seed and temperature=0 are incompatible parameters",
      ],
      correctIndex: 1,
      explanation: "Hosted multi-tenant providers describe seeded, zero-temperature generation as 'best-effort' deterministic — variance can still creep in from infrastructure-level factors outside the sampling algorithm itself. True guaranteed determinism requires a fully controlled stack (e.g. the MockProvider or a local model).",
      difficulty: "senior",
    },
    {
      id: "fundamentals-q3",
      question: "A request has a huge system prompt and retrieved RAG context but asks for only a one-sentence answer. Which latency metric is most affected?",
      options: [
        "Tokens per second (decode throughput)",
        "Time to first token (TTFT), because prefill processes the whole input before generation starts",
        "Neither — latency is only driven by output length",
        "Cost, but never latency",
      ],
      correctIndex: 1,
      explanation: "TTFT is dominated by the prefill phase, which processes the entire input (system prompt + context + history) in one pass before the first output token can be produced. A short requested output doesn't help TTFT at all — it only affects total decode time.",
      difficulty: "intermediate",
    },
    {
      id: "fundamentals-q4",
      question: "You set top_p=0.1 (very narrow) and top_k=500 (very wide) on the same request. What happens?",
      options: [
        "The two settings average out to a medium-width candidate set",
        "top_k=500 always overrides top_p entirely",
        "Whichever constraint is tighter at each decoding step effectively dominates — here, top_p=0.1 is almost certainly the binding constraint",
        "The request will error because the parameters conflict",
      ],
      correctIndex: 2,
      explanation: "top_p and top_k are independent truncations applied to the same distribution; the narrower one in practice determines the candidate set at each step. A top_p of 0.1 will almost always produce a smaller candidate set than top_k=500 for any typical distribution, making the top_k setting effectively a no-op here.",
      difficulty: "senior",
    },
    {
      id: "fundamentals-q5",
      question: "Why does this app's MockProvider need to react visibly to temperature/top_p/top_k even with zero API keys configured?",
      options: [
        "Because CLAUDE.md requires the app to work meaningfully in mock mode, including demonstrating real parameter effects like token-probability shifts",
        "Because mock providers are required by law to simulate real providers exactly",
        "It doesn't need to — mock mode is purely cosmetic and ignores all parameters",
        "Only to make unit tests pass, with no bearing on the actual teaching goal",
      ],
      correctIndex: 0,
      explanation: "The project's acceptance criteria explicitly require that changing temperature and seeing token-probability shifts work with zero keys configured. That means the MockProvider's determinism and parameter-sensitivity aren't incidental — they're the mechanism that makes the whole fundamentals module teach something real without any provider setup.",
      difficulty: "intermediate",
    },
  ],
  presets: [
    {
      id: "fundamentals-temp-0-vs-1-2",
      label: "Temperature 0 vs 1.2 on the same prompt",
      description: "Run the identical prompt at temperature 0 (near-greedy) and 1.2 (highly diverse) side by side, and compare the logprobs panel to see the candidate distribution widen.",
    },
    {
      id: "fundamentals-n-samples-self-consistency",
      label: "5 parallel samples at temperature 0.8",
      description: "Fire n=5 samples of a reasoning-style prompt at once and see how much the final answer varies run to run — a hands-on look at why self-consistency voting exists.",
    },
    {
      id: "fundamentals-compare-models",
      label: "Compare three models on one prompt",
      description: "Send the same messages to three different providers/models at once and compare output, latency, and cost side by side in one SSE-multiplexed run.",
    },
    {
      id: "fundamentals-context-overflow",
      label: "Overflow the context window on purpose",
      description: "Feed a long conversation past the model's context limit and compare truncate-oldest, truncate-middle, sliding-window, and summarize strategies on exactly which messages survive.",
    },
  ],
};
