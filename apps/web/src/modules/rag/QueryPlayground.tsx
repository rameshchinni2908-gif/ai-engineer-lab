import * as React from "react";
import type { RetrievalResult } from "@ail/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";
import type { RagStrategy } from "./api";

const STRATEGIES: { id: RagStrategy; label: string }[] = [
  { id: "basic", label: "Basic (vector only)" },
  { id: "query-rewrite", label: "Query rewrite" },
  { id: "hyde", label: "HyDE" },
  { id: "multi-query", label: "Multi-query" },
  { id: "parent-doc", label: "Parent-document" },
  { id: "compression", label: "Contextual compression" },
  { id: "agentic", label: "Agentic RAG" },
];

interface StageSnapshot {
  stage: string;
  data: unknown;
}

interface BaselineSnapshot {
  strategy: RagStrategy;
  totalTimingMs: number;
  avgScore: number;
  candidateCount: number;
  llmSubCalls: number;
}

export interface QueryPlaygroundProps {
  collection: string;
  onRunComplete?: (runId: string) => void;
  initialStrategy?: RagStrategy;
}

/** M5: retrieve + generate with citations, every stage inspectable via `stage` SSE events; strategies measurable against a basic baseline. */
export function QueryPlayground({ collection, onRunComplete, initialStrategy }: QueryPlaygroundProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [query, setQuery] = React.useState("What does the document say?");
  const [strategy, setStrategy] = React.useState<RagStrategy>(initialStrategy ?? "basic");
  const [topK, setTopK] = React.useState(4);
  const [baseline, setBaseline] = React.useState<BaselineSnapshot | null>(null);

  const sse = useSse(
    "/api/rag/query",
    { query, collection, strategy, topK, providerId, model },
    {
      autoStart: false,
      onEvent: (e) => {
        if (e.type === "run_complete") onRunComplete?.(e.run.id);
      },
    },
  );
  useRunShortcut(sse.start);

  const runEntry = Object.values(sse.runs)[0];
  const stages: StageSnapshot[] = sse.events
    .filter((e): e is Extract<typeof e, { type: "stage" }> => e.type === "stage")
    .map((e) => ({ stage: e.stage, data: e.data }));

  const retrieveStage = [...stages].reverse().find((s) => ["retrieve", "expand-context", "compress"].includes(s.stage));
  const retrievedCandidates = (retrieveStage?.data as { candidates?: RetrievalResult[] } | undefined)?.candidates ?? [];
  const chunkText = new Map<string, string>();
  for (const c of retrievedCandidates) chunkText.set(c.chunkId, c.text);

  const citations = (runEntry?.run?.metadata.citations as { chunkId: string; documentId: string }[] | undefined) ?? [];
  const totalTimingMs = stages.reduce((sum, s) => {
    const d = s.data as { timingMs?: number } | undefined;
    return sum + (typeof d?.timingMs === "number" ? d.timingMs : 0);
  }, 0);
  const avgScore =
    retrievedCandidates.length > 0 ? retrievedCandidates.reduce((s, c) => s + c.score, 0) / retrievedCandidates.length : 0;
  const rewriteStages = stages.filter((s) => s.stage === "rewrite" || s.stage.startsWith("agentic"));

  function captureBaseline() {
    if (!runEntry?.run) return;
    setBaseline({
      strategy,
      totalTimingMs,
      avgScore,
      candidateCount: retrievedCandidates.length,
      llmSubCalls: rewriteStages.length,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Query (<GlossaryTerm id="retrieval-augmented-generation">RAG</GlossaryTerm> pipeline, every stage inspectable)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProviderModelSelector
          providerId={providerId}
          model={model}
          onChange={(next) => {
            setProviderId(next.providerId);
            setModel(next.model);
          }}
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="rag-query-input">Query</Label>
            <Input id="rag-query-input" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rag-strategy">Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as RagStrategy)}>
              <SelectTrigger id="rag-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rag-topk">topK</Label>
            <Input id="rag-topk" type="number" min={1} value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
          </div>
        </div>
        {strategy === "parent-doc" && (
          <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
            Simplified parent-document retrieval: this expands each matched chunk by stitching in its immediate
            SIBLING chunks (previous/next by index within the same document), not a true separate parent/child
            ingestion hierarchy. It approximates the real technique's benefit (precise match + more
            surrounding context) without a dedicated parent-chunk store.
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={sse.start} disabled={sse.status === "connecting" || sse.status === "streaming"}>
            Run query (Ctrl/Cmd+Enter)
          </Button>
          <Button variant="secondary" onClick={captureBaseline} disabled={!runEntry?.run}>
            Save this run as baseline
          </Button>
        </div>
        {sse.error && <p className="text-sm text-destructive">{sse.error.message}</p>}

        {stages.length > 0 && (
          <div className="space-y-1 rounded-md border border-border p-2">
            <h4 className="text-sm font-semibold">Pipeline stages (real SSE events from this run)</h4>
            <ul className="space-y-1 text-xs">
              {stages.map((s, i) => {
                const d = s.data as { candidates?: RetrievalResult[]; timingMs?: number; rewrittenQueries?: string[] };
                return (
                  <li key={i} className="border-t border-border pt-1">
                    <Badge variant="outline">{s.stage}</Badge>{" "}
                    {d.candidates ? `${d.candidates.length} candidate(s)` : null}
                    {d.rewrittenQueries ? ` rewritten -> "${d.rewrittenQueries[0]}"` : null}
                    {typeof d.timingMs === "number" ? ` (${d.timingMs.toFixed(1)}ms)` : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <StreamingRegion
          text={runEntry?.tokens.join("") ?? ""}
          status={runEntry ? (runEntry.status === "pending" ? "idle" : runEntry.status) : "idle"}
          tokenCount={runEntry?.run?.usage.outputTokens}
          label="RAG answer"
        />

        {citations.length > 0 && (
          <div>
            <h4 className="mb-1 text-sm font-semibold">Citations (link back to exact retrieved chunks)</h4>
            <ul className="space-y-1 text-xs">
              {citations.map((c) => (
                <li key={c.chunkId} className="rounded border border-border p-1">
                  <span className="font-mono">
                    [{c.chunkId}] doc={c.documentId}
                  </span>
                  : {chunkText.get(c.chunkId) ?? "(chunk text not in current stage snapshot)"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {baseline && (
          <div className="rounded-md border border-border p-2 text-xs">
            <h4 className="mb-1 font-semibold">Current strategy vs saved baseline ({baseline.strategy})</h4>
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>Metric</th>
                  <th>Baseline</th>
                  <th>Current ({strategy})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total retrieval timing</td>
                  <td>{baseline.totalTimingMs.toFixed(1)}ms</td>
                  <td>{totalTimingMs.toFixed(1)}ms</td>
                </tr>
                <tr>
                  <td>Avg candidate score</td>
                  <td>{baseline.avgScore.toFixed(3)}</td>
                  <td>{avgScore.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>Candidates returned</td>
                  <td>{baseline.candidateCount}</td>
                  <td>{retrievedCandidates.length}</td>
                </tr>
                <tr>
                  <td>Extra LLM sub-calls (rewrite/HyDE/multi-query/agentic)</td>
                  <td>{baseline.llmSubCalls}</td>
                  <td>{rewriteStages.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
