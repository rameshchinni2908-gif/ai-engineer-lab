# Frontend component API (owner: `frontend-shell`)

**Status:** authoritative for everything under `apps/web/src/{app,components,layouts,hooks,stores,lib,styles}/**`.
Module agents (Wave 2) **compose** these components; you never fork, restyle, or reimplement
them. If something you need isn't here, stop and ask the orchestrator for a change to this file
rather than working around it — this is the one thing all 5 Wave-2 agents build against, so drift
here breaks everyone.

Everything below lives under `apps/web/src/`. Import paths use the `@/` alias (`@/components`,
`@/hooks`, `@/stores`, `@/lib`).

---

## 1. How a module page is built (read this first)

Each module agent creates exactly one file: `apps/web/src/modules/<moduleId>/index.tsx`,
default-exporting a page component. `<moduleId>` is one of the 11 `ModuleId` values:
`fundamentals, prompting, structured, embeddings, rag, agents, evals, security, production,
advanced, checklist`.

That page component's entire job is to render **one** `<ModuleShell>`, passing your
Learn/Playground/Experiments/Pitfalls content as props:

```tsx
// apps/web/src/modules/rag/index.tsx
import { useState } from "react";
import { ModuleShell } from "@/components";
import { PresetPicker } from "@/components";
import { MODULE_CONTENT } from "@/content";
import { RagPlayground } from "./RagPlayground"; // your own sub-components, same folder

export default function RagModulePage() {
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const content = MODULE_CONTENT.rag;

  return (
    <ModuleShell
      moduleId="rag"
      title="RAG"
      description="Retrieval-augmented generation end to end."
      learn={<LearnTabContent content={content.learn} />}
      presets={<PresetPicker presets={content.presets} onSelect={(p) => {/* apply p.params */}} />}
      playground={<RagPlayground onRunComplete={setActiveRunId} />}
      experiments={<RagExperiments />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
```

You never touch `apps/web/src/app/router.tsx` — it lazy-loads your `index.tsx` automatically
(via `import.meta.glob`, see §9.2 of `docs/contracts.md`) as soon as the file exists, with no
router edit required on either side.

**Inside `RagPlayground`** (or whatever your own sub-component is called): wherever you render
`useSse`'s streamed text, wrap it in `<StreamingRegion>` (§10) — this is required, not optional,
and is the one thing in this doc every streaming module MUST do:

```tsx
<StreamingRegion text={runs[runId]?.tokens.join("") ?? ""} status={status === "pending" ? "idle" : status} />
```

---

## 2. `<ModuleShell>`

`apps/web/src/components/ModuleShell.tsx`

The three-region layout from CLAUDE.md: **left = Learn** (collapsible), **center =
Playground/Experiments/Pitfalls** (tabbed, tab synced to the URL as `/m/:moduleId/:tab`),
**right = Run Inspector + "Why this happened"**. Responsive: stacks vertically below the `lg`
(1024px) breakpoint, with the right pane becoming a drawer `<Dialog>` opened via an "Inspector"
button next to the tabs.

| Prop | Type | Required | Notes |
|---|---|---|---|
| `moduleId` | `ModuleId` | yes | Drives the URL (`/m/:moduleId/:tab`) and progress tracking. |
| `title` | `string` | yes | Rendered as the page's `<h1>`. |
| `description` | `string` | no | Rendered under the title. |
| `learn` | `ReactNode` | yes | Left pane on wide screens; Learn tab content on narrow screens. |
| `playground` | `ReactNode` | yes | Center content for the Playground tab. |
| `experiments` | `ReactNode` | no | Center content for the Experiments tab. Omit → empty state. |
| `pitfalls` | `ReactNode` | no | Center content for the Pitfalls tab. Omit → empty state. |
| `presets` | `ReactNode` | no | Rendered above `playground` inside the Playground tab — put a `<PresetPicker>` here. |
| `activeRunId` | `string` | no | The run id the right pane should show. Set this from your own state once a run starts/completes (e.g. from `useSse`'s `run_complete` event, or the response of a non-streaming call). Omit while idle — the right pane shows its own empty state, never guesses. |
| `rightPaneExtra` | `ReactNode` | no | Appended below the standard Run Inspector + Why-This-Happened block (e.g. an agent step trace, a retrieval debug panel). |

**Tab routing contract:** `<ModuleShell>` reads the `:tab` URL param itself via `useParams()` and
calls `useNavigate()` on tab change (`/m/<moduleId>/<tab>`). It must be rendered under a route that
has a `:tab` param available (the router already provides this at both `/m/:moduleId` and
`/m/:moduleId/:tab` — you don't need to do anything, just render `<ModuleShell>` inside your
`index.tsx` page component as shown above). Unknown/missing `:tab` defaults to `"learn"`.

**What `<ModuleShell>` does for you, so you don't have to:**
- Persisted collapse state for both side panes (`stores/ui.ts`).
- Mobile/narrow-screen stacking + a Run Inspector drawer.
- Module visit tracking for the left-nav progress bars (`stores/progress.ts`).
- Rendering `<RunInspector runId={activeRunId}>` and `<WhyThisHappened runId={activeRunId}>` in
  the right pane automatically — you only ever pass `activeRunId`, never these two components
  directly, unless you need `rightPaneExtra` for something module-specific.

---

## 3. `<RunInspector>`

`apps/web/src/components/RunInspector.tsx`

```tsx
<RunInspector runId={run.id} />
// or, if you already have the full object (e.g. straight off an SSE run_complete event):
<RunInspector run={completedRun} />
```

| Prop | Type | Notes |
|---|---|---|
| `runId` | `string?` | Fetches `GET /api/runs/:id` via TanStack Query. |
| `run` | `Run?` | Pass the full object to skip the fetch. Takes precedence over `runId`. |
| `className` | `string?` | |

Renders tabs: **Request · Response · Params · Usage & Cost · Latency · Logprobs · Raw JSON**,
each with a copy-to-clipboard button. Shows a loading skeleton while fetching, an `EmptyState`
when no run is selected, and an `ErrorState` on fetch failure. Two buttons ("A" / "B") stage the
current run into the global compare selection (`stores/runs.ts`) for `<CompareView>`.

You normally don't render this directly — `<ModuleShell activeRunId={...}>` does it for you. Use
it directly only on a custom page (like the `/runs` history page) that isn't a `<ModuleShell>`.

---

## 4. `<CompareView>`

`apps/web/src/components/CompareView.tsx`

```tsx
<CompareView a={runIdA} b={runIdB} />          // fetches GET /api/runs/compare
<CompareView a={runObjectA} b={runObjectB} />  // diffs client-side, no fetch
<CompareView />                                 // falls back to the global A/B compare-selection store
```

| Prop | Type | Notes |
|---|---|---|
| `a`, `b` | `string \| Run` (optional) | Both must be the same "shape" (both ids or both objects). If omitted, reads `stores/runs.ts`'s `compareA`/`compareB` (set by `<RunInspector>`'s A/B buttons). |

Renders a real word-level diff of `output.text` (via `lib/diff.ts`'s `diffWords`, LCS-based — not
a generic "these differ" message), plus param/usage/metric deltas (`lib/diff.ts`'s `diffFields`).

---

## 5. `<WhyThisHappened>`

`apps/web/src/components/WhyThisHappened.tsx`

```tsx
<WhyThisHappened runId={activeRunId} />
// or:
<WhyThisHappened explain={explainRunResponse} />
```

| Prop | Type | Notes |
|---|---|---|
| `runId` | `string?` | Calls `POST /api/explain-run` with the current `useDifficulty()` level; re-fetches when difficulty changes. |
| `explain` | `ExplainRunResponse?` | Pass pre-fetched data to skip the request. |

Renders the summary (difficulty-aware via `explain.variants`), each `factor` with an
increased/decreased/neutral icon, and `whatToTryNext`. If the run hasn't finished yet (backend
409), shows a clear "not ready" message instead of a generic error. **Never shows boilerplate
text** — if you see generic copy here, the bug is in `explainRun()` (backend-core), not this
component; report it, don't patch around it here.

Like `<RunInspector>`, `<ModuleShell activeRunId={...}>` renders this for you automatically.

---

## 6. `<GlossaryTerm>` + `<AutoLinkedText>`

`apps/web/src/components/GlossaryTerm.tsx`

```tsx
<p>
  Lowering <GlossaryTerm id="temperature">temperature</GlossaryTerm> makes sampling more
  deterministic.
</p>
```

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | Must match a `GlossaryTerm.id` in `@/content`'s `GLOSSARY`. Unknown id → renders children as plain text + a dev-console warning. |
| `children` | `ReactNode` | The visible, underlined trigger text. |

Keyboard-accessible: hover **or focus** shows a tooltip with the short definition; click/Enter
opens a popover with the full definition and a link to `/glossary#<id>`.

Also exported: `<AutoLinkedText text={someLearnBlockBody} />` — scans plain text and
auto-wraps the **first** occurrence of each known glossary term in `<GlossaryTerm>`, for prose
where hand-wrapping every term is tedious. Longer terms match before their substrings (e.g.
"top-p sampling" before "top-p").

---

## 7. `<ProviderModelSelector>` (alias: `<ProviderModelSelect>`)

`apps/web/src/components/ProviderModelSelector.tsx`

```tsx
<ProviderModelSelector
  providerId={providerId}
  model={model}
  onChange={({ providerId, model }) => { /* update your local state */ }}
  filter={(m) => m.supportsVision}
/>
```

Reads `GET /api/providers` + `GET /api/models`. Flags models whose provider has no configured key
with a "no key" badge (never disables `mock`). Shows the selected model's context window and
per-MTok input/output cost, with an adjacent `<PricingDisclosure />` (`components/PricingDisclosure.tsx`)
marking those figures as illustrative, not live provider pricing — `MODEL_CATALOG`'s rates are
explicitly placeholders per CLAUDE.md, and nothing here should present them as authoritative.
Use `<PricingDisclosure />` yourself anywhere else you surface a per-MTok *rate* (not needed for a
run's own computed `cost`, which is already real). Seed your local state from
`stores/provider-model.ts` (`useProviderModelStore`) so the choice persists across the app; this
component is controlled — it does not own state itself.

---

## 8. `<DifficultyToggle>` / `useDifficulty()`

`apps/web/src/components/DifficultyToggle.tsx`, `apps/web/src/hooks/useDifficulty.tsx`

```tsx
const { difficulty, setDifficulty, isAtLeast, pick } = useDifficulty();

// in your Learn content:
<p>{pick(content.learn.summary)}</p>
{isAtLeast("senior") && <SeniorGotchasList items={content.learn.seniorGotchas} />}
```

`<DifficultyToggle />` is a segmented control (Beginner/Intermediate/Senior); mount it anywhere
(it's already in the app header via `<AppShell>` — you don't need to add your own unless you want
a second one inline in your content). `useDifficulty()` must be called under `<DifficultyProvider>`
(already mounted at the app root in `app/providers.tsx` — you never mount this yourself).

- `pick(map: Record<Difficulty, T>): T` — selects the current level's value out of a
  `summary: Record<Difficulty, string>`-shaped object (exactly `ModuleLearnContent.summary`'s
  shape from `@/content`).
- `isAtLeast(level)` — true if current difficulty is at or above `level` in
  beginner < intermediate < senior order.

---

## 9. `useSse<TEvent>(url, body, options?)`

`apps/web/src/hooks/useSse.ts`

The **only** way to call a streaming endpoint (docs/contracts.md §2). Never use `EventSource` or
hand-roll a `fetch` + reader loop in a module — this hook owns POST + SSE framing + heartbeat
filtering + per-`runId` demuxing + close-without-`done` failure handling.

```tsx
const { status, events, runs, error, start, abort } = useSse(
  "/api/fundamentals/sample",
  { providerId, model, messages, params, n: 3 },
  { autoStart: false },
);

useRunShortcut(start); // optional: wire Ctrl/Cmd+Enter to this playground's run button

// n=3 parallel samples all land on the same connection, demuxed by runId.
// Render each sample's growing text through <StreamingRegion> (§10) - never
// a raw <p>{tokens.join("")}</p> - so screen readers get a sane announcement:
Object.values(runs).map((r) => (
  <StreamingRegion key={r.runId} text={r.tokens.join("")} status={r.status === "pending" ? "idle" : r.status} />
))
```

| Return field | Type | Notes |
|---|---|---|
| `status` | `"idle" \| "connecting" \| "streaming" \| "done" \| "error" \| "aborted"` | Connection-level. |
| `events` | `SseEvent[]` | Every event, across all `runId`s, in arrival order. |
| `runs` | `Record<string, RunStreamState>` | Demuxed by `runId`. Each has `status`, `tokens: string[]` (join for the running text), `events`, `run?` (populated on `run_complete`), `error?`. |
| `error` | `{ code, message } \| null` | Connection-level error — includes the close-without-`done` case (`code: "STREAM_CLOSED"`). |
| `start()` | `() => void` | Fires the POST. No-op if already in flight or `url` is `null`. |
| `abort()` | `() => void` | Aborts the in-flight request; sets `status` to `"aborted"`. |

Options: `{ autoStart?: boolean; onEvent?: (e: SseEvent) => void; headers?: Record<string,string> }`.
`autoStart` defaults to `false` — most playgrounds want an explicit "Run" button
(`start`), not an immediate fetch on mount.

Pass `activeRunId` to `<ModuleShell>` once a run in `runs` reaches `"complete"` (use
`runs[id].run.id`, or just the `runId` key once status is `"complete"`), so the Run Inspector
pane updates. There is no built-in "auto-persist to recent runs" — call
`useRunsStore.getState().pushRecentRun(runId)` yourself if you want it in the `/runs` history
quick-list sooner than its next `GET /api/runs` fetch (it's persisted server-side regardless).

Companion hook: `useRunShortcut(onRun: () => void)` (`hooks/useKeyboardShortcuts.ts`) subscribes
your playground's run handler to the global `Ctrl/Cmd+Enter` shortcut.

---

## 10. `<StreamingRegion>` — REQUIRED for all streamed text output

`apps/web/src/components/StreamingRegion.tsx`

```tsx
<StreamingRegion
  text={runs[runId]?.tokens.join("") ?? ""}
  status={streamStatus}        // "idle" | "streaming" | "complete" | "error"
  tokenCount={tokenCount}      // optional; falls back to a whitespace-split estimate of `text`
  label="Generation"           // optional; prefixes the announcement, e.g. "Sample 2"
/>
```

| Prop | Type | Notes |
|---|---|---|
| `text` | `string` | Accumulated streamed text so far. |
| `status` | `"idle" \| "streaming" \| "complete" \| "error"` | Drives `aria-busy`, the pulsing cursor, and which announcement fires. Map `useSse`'s `RunStreamState.status` (`"pending"` → treat as `"idle"`) onto this. |
| `tokenCount` | `number?` | Exact count for the completion/progress announcement. Omit to fall back to an estimate from `text`. |
| `label` | `string?` | Default `"Generation"`. Use something like `"Sample 2"` or `"Retrieval"` when a playground has multiple concurrent streams. |
| `children` | `ReactNode?` | Override the visible rendering (default: `text` in a `whitespace-pre-wrap` block). Doesn't affect the announcement logic. |

**Why this exists and why it's mandatory:** CLAUDE.md requires WCAG AA. Raw streamed text in a plain `<p>` is either silent to screen readers (no `aria-live`) or, if you naively slap `aria-live="polite"` on the growing buffer, re-announces the *entire* buffer on every single token — unusable. `<StreamingRegion>` solves both: a visually-hidden `role="status"` live region (`aria-live="polite"`, `aria-atomic="false"`) is throttled to a periodic "in progress, N tokens so far" update plus exactly one "complete, N tokens" (or "failed") summary on completion; the visible text block updates live for sighted users every token, same as before, but is `aria-hidden` so it isn't double-announced. The pulsing in-progress cursor respects `prefers-reduced-motion`.

**Module agents MUST use this for every streamed-text surface — do not roll your own `aria-live` region or render raw streamed text unwrapped.** This applies per concurrent stream: a sampling lab with `n=3` renders 3 `<StreamingRegion>`s (one per `runId`, each with its own `label`), not one shared region.

**Does `<ModuleShell>` apply this automatically? No, by design.** `ModuleShell`'s `playground` slot accepts arbitrary content and has no visibility into how many concurrent streams it contains (zero, one, or N — e.g. the model-comparison and sampling labs) or which ones even *stream* (structured-output/eval playgrounds may have no raw text stream at all). Auto-wrapping would either wrap nothing useful or double-wrap N independent streams incorrectly. Instead, this is enforced by visibility, not framework magic: it's exported from the components barrel, documented here as required, and shown directly in §1's "how a module page is built" example so every Wave 2 agent sees it in the one file they're told to read first.

---

## 11. `<PresetPicker>`

`apps/web/src/components/PresetPicker.tsx`

```tsx
<PresetPicker
  presets={content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }))}
  activeId={activePresetId}
  onSelect={(preset) => applyParams(preset.params)}
/>
```

Generic over your own params shape `T`. Renders each `PresetCopy` (from `@/content`, ≥3 per
module per CLAUDE.md) as a card with a "Try this" button; you own what `onSelect` does with
`preset.params` (a field you zip onto the content-writer's `PresetCopy` yourself — this component
never inspects it).

---

## 12. `<EmptyState>` / `<ErrorState>`

`apps/web/src/components/EmptyState.tsx`

```tsx
<EmptyState title="No documents yet" description="Upload one to get started." action={{ label: "Upload", onClick: openUploadDialog }} />
<ErrorState message={error.message} requestId={error instanceof ApiClientError ? error.requestId : undefined} onRetry={refetch} />
```

Use these for every async surface's empty/error state (CLAUDE.md requirement) instead of
ad hoc markup, so empty/error states look consistent across all 11 modules.

---

## 13. `lib/api.ts` — typed API client

```ts
import { api, queryKeys, ApiClientError } from "@/lib/api";

const { data } = useQuery({ queryKey: queryKeys.run(id), queryFn: () => api.run(id) });
```

`api` currently covers the §3 shared/platform routes (`health`, `models`, `providers`, `runs`,
`run`, `deleteRun`, `compareRuns`, `explainRun`, `traces`, `trace`). **Module agents add their own
per-module fetchers next to their routes** (e.g. `apps/web/src/modules/rag/api.ts`) — you may
import `apiFetch`/`ApiClientError` from here for consistency, but do not add module-specific
methods to this file (you don't own it).

`apiFetch<T>(path, { body, query, ...init })` is the low-level wrapper everything above is built
on: JSON in/out, throws `ApiClientError` (has `.code`, `.message`, `.requestId`, `.status`) on any
non-2xx response, matching `docs/contracts.md` §1's `ApiErrorSchema`. Never reads provider keys —
there are none in frontend code, by design.

---

## 14. `lib/diff.ts`

Pure, dependency-free, unit-tested word diff + field diff, used by `<CompareView>`:

- `diffWords(a: string, b: string): DiffToken[]` — LCS-based word-level diff; `DiffToken = { op: "add" | "remove" | "same", text: string }`.
- `diffFields(a: Record<string, unknown>, b: Record<string, unknown>): FieldDiff[]` — shallow
  key-by-key diff with a `changed: boolean` flag, for params/usage/metrics.

Reuse these instead of writing your own diff if a module needs one (e.g. a prompt-version diff in
M2, or an eval-variant diff in M7).

---

## 15. Zustand stores (`apps/web/src/stores/`)

All persisted to `localStorage` under the listed key unless noted. **Read, don't fork** — if a
module needs new global state, ask the orchestrator to extend one of these rather than rolling
your own parallel persisted store for the same concern (theme, difficulty, provider/model,
run history/compare, nav progress, layout chrome).

| Store | Key | Shape (selected) | Notes |
|---|---|---|---|
| `useThemeStore` | `ail-theme` | `{ preference, resolved }` | Prefer `useTheme()` (hooks/useTheme.tsx) over this directly. |
| `useDifficultyStore` | `ail-difficulty` | `{ difficulty }` | Prefer `useDifficulty()` over this directly. |
| `useProviderModelStore` | `ail-provider-model` | `{ providerId, model }` | Seed `<ProviderModelSelector>`'s controlled props from this; defaults to `mock`/`mock-small`. |
| `useRunsStore` | `ail-runs` | `{ recentRunIds, compareA, compareB }` | `pushRecentRun(id)`, `setCompareSlot("a"\|"b", id)`. |
| `useProgressStore` | `ail-progress` | `{ visited }` | `markVisited(moduleId, tab)` (called automatically by `<ModuleShell>`), `moduleCompletionRatio(moduleId)`. |
| `useUiStore` | `ail-ui` | pane collapse + dialog open flags | Drives `<ModuleShell>`'s pane collapse and the command palette / shortcuts dialog. You shouldn't need this directly. |

---

## 16. `components/ui/` primitives

shadcn/ui-style primitives (cva + `cn()` + Radix where applicable) in
`apps/web/src/components/ui/`: `button`, `card`, `tabs`, `slider`, `switch`, `select`, `dialog`,
`popover`, `tooltip` (+ `TooltipProvider`, already mounted at the app root), `accordion`,
`scroll-area`, `separator`, `label`, `progress`, `badge`, `alert`, `skeleton`, `table`, `input`,
`textarea`, `toast` (+ `<Toaster />`, already mounted at the app root — call `toast({ title, description, variant })` from anywhere).

Import from the barrel: `import { Button, Card, Tabs, ... } from "@/components/ui";`. These are
the ONLY styling building blocks module agents should use for new UI — compose them, don't write
raw Tailwind classes that duplicate what a primitive already provides, and don't edit the
primitives themselves (ask frontend-shell/orchestrator if one is missing a variant you need).

---

## 17. Accessibility & keyboard shortcuts (already wired, nothing to do)

- Skip-to-content link, semantic landmarks (`<header>`, `<nav>`, `<main id="main-content">`),
  visible focus rings on every interactive primitive, dark/light contrast tuned for AA in both
  themes, `prefers-reduced-motion` respected (`Skeleton`'s pulse is disabled under it).
- Global shortcuts (`hooks/useKeyboardShortcuts.ts`, mounted once in `<AppShell>`):
  `Ctrl/Cmd+Enter` → `useRunShortcut` subscribers · `Ctrl/Cmd+Shift+L` → theme toggle ·
  `Ctrl/Cmd+I` → inspector pane toggle · `Ctrl/Cmd+K` → command palette · `?` → shortcuts help
  dialog.
- If you add a custom interactive element (not one of the `components/ui/` primitives), it MUST
  have a visible focus ring, an accessible name (`aria-label` or visible text), and work with
  keyboard alone — this is audited by the `reviewer` agent.

---

## 18. What NOT to do

- Don't edit `apps/web/src/app/router.tsx`, `apps/web/src/app/modules.config.ts`, or anything
  under `apps/web/src/{components,layouts,hooks,stores,lib,styles}/**` — file ownership per
  `docs/contracts.md` §5. If something here is missing or wrong, tell the orchestrator.
- Don't write your own SSE parser, diff algorithm, theme/difficulty state, or toast system — all
  of the above already exist.
- Don't render raw streamed text, or roll your own `aria-live` region for it — use
  `<StreamingRegion>` (§10). This is audited by the `reviewer` agent.
- Don't show a per-MTok rate (from `GET /api/models` / `MODEL_CATALOG`) without the
  `<PricingDisclosure>` affordance (§7) nearby — those numbers are illustrative placeholders, not
  live provider pricing. A run's own *computed* `cost` (already real tokens × that illustrative
  rate) is fine to show plainly; it's the rate card itself that needs the disclosure.
- Don't restyle a `components/ui/` primitive by overriding its internals; pass `className` (merged
  via `cn()`/`tailwind-merge`, last-wins) for one-off layout tweaks only.
