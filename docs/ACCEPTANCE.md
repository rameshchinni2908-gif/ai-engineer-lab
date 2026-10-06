# AI Engineer Lab — Final Acceptance Report

Audited against `CLAUDE.md`'s **Acceptance criteria** at commit `f7fef13` (end of Wave 3).

Everything below was **verified by running it**, not inferred from a green test suite. Where a claim
rests on something weaker than a live check, that is stated. The last section lists what is **not**
true of this build, which is the part worth reading most carefully.

---

## 1. "`docker compose up` or `pnpm dev` runs everything in Mock mode with zero keys"

**PASSES — both paths, verified live.**

| Check | Evidence |
|---|---|
| `docker compose up -d --build` | exit 0; `api` healthy, `web` up |
| Web through nginx | `GET http://localhost:8080/` → **HTTP 200** |
| API through the nginx proxy | `GET /api/health` → `{"ok":true,"mode":"mock","providers":{"configured":{"anthropic":false,"openai":false,...}},"db":{"ok":true,"driver":"better-sqlite3"}}` |
| **SSE through nginx** (the fragile part) | 12 `token` + 12 `logprobs` + `run_start` + `run_complete` + **exactly one** `done`; **TTFB 20ms vs 52ms total** — first byte at 39% of stream life, so genuinely incremental, not proxy-buffered |
| `pnpm dev` | API on 8787 `mode: mock`, web on 5173 HTTP 200 |
| Zero keys | Run with `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`LLM_PROVIDER` explicitly **unset** |
| `pnpm seed` | 5 documents indexed, 2 datasets × 18 cases (one via the CSV importer), 2 prompt versions |

Qdrant sits behind an opt-in `qdrant` compose profile so the default stack needs no extra service —
consistent with CLAUDE.md's "InMemoryStore (zero-setup default)", and documented in the compose header.

**Minor wart, not a defect:** `/api/health` reports `ollama: true` with no Ollama installed. The field
is deliberately named `configured`, not `available` (Ollama needs no key; reachability is a separate
concern, per the comment in `registry.ts:44`). It is still readable as "available" at a glance.

---

## 2. The five user journeys

All five have a **Playwright spec that passes against a real server** (5/5, repeated 3×), at the
default 1280×720 viewport.

| Criterion | Status | How it is proven |
|---|---|---|
| Change temperature → see token-probability shifts | **PASSES** | `temperature-probability.spec.ts` + my live probe below |
| Build a RAG pipeline and inspect retrieval | **PASSES** | `rag-build-inspect.spec.ts`; live query against the seeded corpus emits a `retrieve` stage event carrying the candidate chunks |
| Run an agent and view its trace | **PASSES** | `agent-trace.spec.ts` — per-step trace, terminal `stopReason` |
| Run an eval across two prompt versions | **PASSES** | `eval-prompt-versions.spec.ts` — per-variant results matrix |
| Attack a bot, enable defenses, re-run | **PASSES** | `attack-defend.spec.ts` — same attack succeeds, then is blocked, with the blocking layer named |

### The temperature criterion, measured directly

Same prompt, same `seed: 42`, same token position — only temperature differs:

| temperature | chosen token | p(chosen) | alternatives |
|---|---|---|---|
| **0.0** | `offers` | 1.000 | all collapsed to 0.000 |
| **1.5** | `broadly` | 0.116 | `offers` 0.336, `clearly` 0.172, `largely` 0.141 |

At 0 the distribution correctly becomes a point mass on the argmax; at 1.5 it selected a
**lower**-probability token over the top one. That is real softmax-temperature behaviour, not a
cosmetic animation. Fixed template tokens honestly report p=1.0 with no alternatives; only genuine
choice points carry a distribution.

### A teaching detail worth knowing

Querying the seeded corpus with *"How much does the Pro plan cost?"* retrieves the
**deliberately stale `ARCHIVED` pricing document** as its top chunk. That is intentional: the seed
corpus ships contradictory material so the RAG failure-mode lab has something real to fail on.

---

## 3. "Typed end to end, linted, documented, tests green"

**PASSES.**

| Step | Result |
|---|---|
| `pnpm typecheck` | exit 0 — TS strict across `shared`, `api`, `web` |
| `pnpm lint` | exit 0 — ESLint flat config, `--max-warnings=0` |
| `pnpm test` | **743 passed / 0 failed** (12 shared + 638 api + 93 web), **3 consecutive identical runs** |
| `pnpm build` | exit 0 (one pre-existing >500 kB chunk advisory) |
| `pnpm test:e2e` | 5/5 |

The repeat-run standard is only meaningful because `apps/api/vitest.global-setup.ts` now clears
per-suite SQLite scratch files. Before that fix, run 2 of the api suite failed on accumulated rows and
"3 green runs" required deleting a file by hand between each — a standard being met by hand-holding is
not a standard.

---

## 4. Per-module definition of done (CLAUDE.md §"Definition of done per module")

All 11 modules: Learn + Playground + Experiments + Pitfalls tabs, ≥3 presets, "Why this happened",
unit tests, glossary terms.

| Item | Status |
|---|---|
| ≥3 presets ("Try this") | **PASSES** — 4–5 per module |
| Presets actually **apply** | **PASSES, after a significant fix** — see below |
| "Why this happened" tied to the real run | **PASSES** — `explainRun()` interpolates actual token counts, measured latency, computed cost, finish reason, real logprob spread. Not generic text. |
| Glossary ≥150 terms | **PASSES** — 172 |
| Tabs on all 11 | **PASSES** |

**The presets were broken in 7 of 11 modules** and reported as working. They rendered and highlighted;
clicking one changed nothing. This passed three audit rounds and an 11-row definition-of-done table
that marked presets PASS for every module — because presets *render*. Now fixed everywhere, with
`!== undefined` checks rather than truthiness throughout: `if (params.temperature)` silently skips
`temperature: 0`, which is the single preset that demonstrates criterion #2 above.

---

## 5. Security rules (CLAUDE.md, "non-negotiable")

| Rule | Status |
|---|---|
| API keys server-only, never sent to browser | **PASSES** — no key ever crosses the boundary; `/api/health` exposes only booleans |
| Never log raw prompts containing PII | **PASSES, after fixing a BLOCKER** — see below |
| Sandbox isolated, no host FS/network | **PASSES** — `vm.createContext(Object.create(null))`; 11 escape-attempt regression tests; re-attacked independently twice (incl. the vm2 `Error.prepareStackTrace` CVE pattern) with no bypass found |
| HTTP fetch tool allow-list | **PASSES, stronger than required** — deny-by-default *and* the tool makes no real network call at all, so redirect/DNS-rebind SSRF is structurally moot |
| Red-team bot has no real side effects | **PASSES** — scripted, in-app, mock tools only, disclosed in the UI |
| Per-IP rate limiting + request IDs | **PASSES** — registered app-wide |

### The redaction BLOCKER (found in final audit, fixed, re-verified by me)

Pino redaction was bypassable **on every 4xx/5xx response**. The sanitizer hooked pino's *merge
object* only; pino's second argument — the message string — was never touched, and the error handler
passed `err.message` as exactly that. Zod echoes an invalid enum value **verbatim**, and
`ProviderIdSchema` is a `z.enum` on nearly every generation route. So any string a client submitted was
written to the log raw. A second hole on the same path: `err` was exempted from the sanitizer in
favour of a `serializers.err` that did not exist.

The log line it produced, two fields side by side — note what got protected and what did not:

```
"code":"[redacted]", ... "msg":"body.providerId: Invalid enum value. Expected 'anthropic' | ...,
 received 'PIILEAK-SENTINEL-ssn-123-45-6789'"
```

Fixed in three layers (message-argument sanitisation in `logMethod`, a real `serializers.err`, and the
handler no longer passing user text as the message). Re-verified against a live server, each probe
carrying a positive control so a silent failure could not look like success:

| Probe | Result |
|---|---|
| Positive control (`incoming request`, `request completed`) | present — the probe genuinely reads the log |
| Sentinel in `providerId` | **0 occurrences** |
| Bare `123-45-6789` | **0** |
| **PII in a *successful* request's prompt** (SSN + email) | **0** — a vector nobody had tested, and the one the rule is literally about |
| Client response still names the invalid field | yes — `ApiErrorSchema` contract intact |

**Scope limit, stated plainly:** redaction is **pattern-based, not semantic**. It catches SSN shape,
emails, `Bearer` tokens, `sk-`/`pk-`/`rk-` keys, opaque ≥20-char runs, and long single-quoted values,
and caps messages at 500 chars. **Names, addresses, and free-form sensitive prose without one of those
shapes are NOT redacted.** Do not treat this as a compliance-grade PII filter.

---

## What is NOT true of this build

Read this section before trusting any number above.

1. **The Anthropic, OpenAI and Ollama providers have never made a live call.** They compile, are
   wired, and `fetch` real endpoints — but no request has left this machine to any of them in the
   entire build. Only `estimateCost` arithmetic is tested. **Mock is the only provider with evidence
   behind it.** Expect real bugs on first contact with a live API: auth, streaming frame shapes,
   error mapping, and rate-limit handling are all unexercised.
2. **Most "measured" numbers are simulated.** Cost, latency savings, batching, routing, caching,
   context-trimming, quantization and index trade-offs are computed from a catalog and a deterministic
   mock, not observed from real inference. The UI labels these "illustrative"/"simulated"; `README.md`
   has a "What's simulated" section. The arithmetic is real; the *inputs* are synthetic.
3. **jsdom cannot prove layout.** The `ModuleShell` overlap fix is guarded by a unit test asserting the
   structural class contract plus a Playwright click at 1280×720. Neither measures pixel geometry. A
   different overlap at an untested viewport would not be caught.
4. **Mock logprobs are honest but not a real model's.** They come from genuine softmax/temperature/
   top-p/top-k math over a synthetic corpus, reported from the full pre-truncation distribution. They
   teach the right *shape*; they are not an LLM's actual distribution.
5. **No load, soak, or concurrency testing.** SQLite with WAL, SSE fan-out, and the rate limiter have
   never been tested under parallel users.
6. **a11y is reviewed, not audited with assistive tech.** WCAG AA intent is implemented and reviewed
   (labels, roles, focus order, contrast in both themes); no screen-reader pass or automated axe run
   was performed.
7. **One agent-reported result I could not independently confirm**: the `AgentPlayground` `maxSteps: 0`
   test exercises the prop contract rather than a keystroke-reachable path, because the real input
   clamps to 1. The agent disclosed this; I did not re-derive it.

## The pattern behind every defect found late

Five separate defects in this build shipped **with green tests over them**, because each test asserted
the *easy* version of its property:

| Defect | What the test checked | What it should have checked |
|---|---|---|
| Sandbox realm escape | bare `require`/`fetch` are undefined | prototype-chain escapes reach `process` |
| Presets inert in 7/11 modules | the preset renders and highlights | a control's **value** changes |
| Cost "measured savings" | `toBe(0)` on a **$0-rate** model | exact `tokens × non-zero rate` product |
| `embed.ts` error Run | the promise rejected | the Run is **queried back** and exists |
| Log redaction | `log.info({req}, "static literal")` | the two-arg `log.warn(obj, dynamicString)` shape production actually uses |

The lesson that generalises: **a test that asserts the easy version of a property is worse than no
test, because it manufactures confidence.** Every one of these was found by asking "could this
assertion ever fail?" rather than by reading code or adding coverage.
