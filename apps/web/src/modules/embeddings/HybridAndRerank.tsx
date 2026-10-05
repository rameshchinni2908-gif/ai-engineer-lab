import * as React from "react";
import type { RetrievalResult } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { EmptyState } from "@/components/EmptyState";
import { useProviderModelStore } from "@/stores/provider-model";
import { embeddingsApi } from "./api";

const DEMO_COLLECTION = "hybrid-rerank-demo";
const DEMO_DOCS = [
  { id: "d1", text: "Product code SKU-48213 was restocked this week after a brief shortage." },
  { id: "d2", text: "Our warehouse replenished inventory for the item with code SKU-48213 on Tuesday." },
  { id: "d3", text: "Customers love the comfortable fit and soft material of this jacket." },
  { id: "d4", text: "The jacket's fabric is breathable and the sizing runs true to standard." },
  { id: "d5", text: "Quarterly revenue grew twelve percent year over year across all regions." },
];

/** M4: hybrid BM25+vector search (fused via RRF) and reranking before/after - legible side-by-side rankings. */
export function HybridAndRerank(): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [query, setQuery] = React.useState("SKU-48213");
  const [topK, setTopK] = React.useState(3);
  const [seeded, setSeeded] = React.useState(false);
  const [debug, setDebug] = React.useState<{ stage: string; candidates: RetrievalResult[] }[] | null>(null);
  const [fused, setFused] = React.useState<RetrievalResult[] | null>(null);
  const [rerankResult, setRerankResult] = React.useState<{ before: RetrievalResult[]; after: RetrievalResult[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function ensureSeeded() {
    if (seeded) return;
    try {
      await embeddingsApi.createCollection(DEMO_COLLECTION, 64, { distance: "cosine" });
    } catch {
      // Already exists from a previous run in this session - fine.
    }
    const { embeddings } = await embeddingsApi.embed(DEMO_DOCS.map((d) => d.text), providerId, model);
    await embeddingsApi.upsert(
      DEMO_COLLECTION,
      DEMO_DOCS.map((d, i) => ({ id: d.id, vector: embeddings[i]!, metadata: { chunkId: d.id, documentId: "demo", text: d.text } })),
    );
    setSeeded(true);
  }

  async function runHybrid() {
    setError(null);
    try {
      await ensureSeeded();
      const { results, debug: dbg } = await embeddingsApi.hybridSearch(DEMO_COLLECTION, query, topK, providerId, model);
      setFused(results);
      setDebug(dbg.stages);
      setRerankResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hybrid search failed");
    }
  }

  async function runRerank() {
    if (!fused) return;
    setError(null);
    try {
      const result = await embeddingsApi.rerank(query, fused);
      setRerankResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rerank failed");
    }
  }

  const stage = (name: string) => debug?.find((s) => s.stage === name)?.candidates ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GlossaryTerm id="hybrid-search">Hybrid search</GlossaryTerm> (BM25 + vector, fused via{" "}
          <GlossaryTerm id="reciprocal-rank-fusion">RRF</GlossaryTerm>) + <GlossaryTerm id="reranking">reranking</GlossaryTerm>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="hr-query">Query (try an exact code like "SKU-48213", then a paraphrase like "comfortable jacket")</Label>
            <Input id="hr-query" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hr-topk">topK</Label>
            <Input id="hr-topk" type="number" min={1} value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
          </div>
        </div>
        <Button onClick={runHybrid}>Run hybrid search</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!debug ? (
          <EmptyState title="No search run yet" description="Run a hybrid search to see BM25, vector, and fused rankings." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {(["bm25", "vector", "fusion"] as const).map((s) => (
                <div key={s} className="rounded-md border border-border p-2">
                  <h4 className="mb-1 text-sm font-semibold capitalize">{s} ranking</h4>
                  <ol className="space-y-1 text-xs">
                    {stage(s).map((c, i) => (
                      <li key={c.chunkId} className="flex items-center justify-between gap-1">
                        <span className="truncate">
                          {i + 1}. {c.text}
                        </span>
                        <Badge variant="outline">{c.score.toFixed(3)}</Badge>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            <Button size="sm" onClick={runRerank} disabled={!fused || fused.length === 0}>
              Rerank the fused results
            </Button>

            {rerankResult && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Before (fusion order)</h4>
                  <ol className="space-y-1 text-xs">
                    {rerankResult.before.map((c, i) => (
                      <li key={c.chunkId}>
                        {i + 1}. {c.text} <Badge variant="outline">{c.score.toFixed(3)}</Badge>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold">After (reranked, mock cross-encoder)</h4>
                  <ol className="space-y-1 text-xs">
                    {rerankResult.after.map((c, i) => {
                      const beforeIdx = rerankResult.before.findIndex((b) => b.chunkId === c.chunkId);
                      const moved = beforeIdx !== i;
                      return (
                        <li key={c.chunkId}>
                          {i + 1}. {c.text} <Badge variant={moved ? "warning" : "outline"}>{c.score.toFixed(3)}</Badge>
                          {moved && <span className="ml-1 text-muted-foreground">(was #{beforeIdx + 1})</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
