import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { useProviderModelStore } from "@/stores/provider-model";
import { embeddingsApi } from "./api";
import type { EmbeddingsPresetParams } from "./presetTypes";

const DEFAULT_QUERY = "a small kitten sleeping";
const DEFAULT_CANDIDATES = [
  "a tiny cat napping",
  "a huge industrial crane",
  "a small kitten sleeping on a giant cushion repeated many times to inflate magnitude",
  "stock market volatility report",
];

type Metric = "cosine" | "dot" | "euclidean";
const METRICS: Metric[] = ["cosine", "dot", "euclidean"];

interface Row {
  text: string;
  magnitude: number;
  scores: Record<Metric, number>;
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export interface SimilarityLabProps {
  onRunComplete?: (runId: string) => void;
  appliedParams?: EmbeddingsPresetParams;
}

/** M4: similarity metrics demo - cosine vs dot vs euclidean on the SAME vectors, showing where rankings diverge. */
export function SimilarityLab({ onRunComplete, appliedParams }: SimilarityLabProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [query, setQuery] = React.useState(DEFAULT_QUERY);
  const [candidatesRaw, setCandidatesRaw] = React.useState(DEFAULT_CANDIDATES.join("\n"));
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.simQuery !== undefined) setQuery(appliedParams.simQuery);
    if (appliedParams.simCandidates !== undefined) setCandidatesRaw(appliedParams.simCandidates.join("\n"));
  }, [appliedParams]);

  const run = React.useCallback(async () => {
    const candidates = candidatesRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (candidates.length === 0) return;
    setLoading(true);
    try {
      const { embeddings, runId } = await embeddingsApi.embed([query, ...candidates], providerId, model);
      onRunComplete?.(runId);
      const queryVec = embeddings[0]!;
      const candidateVecs = embeddings.slice(1);
      const results: Row[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const vec = candidateVecs[i]!;
        const scores: Partial<Record<Metric, number>> = {};
        for (const metric of METRICS) {
          const { score } = await embeddingsApi.similarity(queryVec, vec, metric);
          scores[metric] = score;
        }
        results.push({ text: candidates[i]!, magnitude: magnitude(vec), scores: scores as Record<Metric, number> });
      }
      setRows(results);
    } finally {
      setLoading(false);
    }
  }, [query, candidatesRaw, providerId, model, onRunComplete]);

  const rankings: Record<Metric, Row[]> = {
    cosine: rows ? [...rows].sort((a, b) => b.scores.cosine - a.scores.cosine) : [],
    dot: rows ? [...rows].sort((a, b) => b.scores.dot - a.scores.dot) : [],
    euclidean: rows ? [...rows].sort((a, b) => a.scores.euclidean - b.scores.euclidean) : [], // lower = more similar
  };
  const topDiverges = rows && rankings.cosine[0]?.text !== rankings.dot[0]?.text;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Similarity metrics: <GlossaryTerm id="cosine-similarity">cosine</GlossaryTerm> vs{" "}
          <GlossaryTerm id="dot-product-similarity">dot</GlossaryTerm> vs euclidean
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
        <div>
          <Label htmlFor="sim-query">Query text</Label>
          <Input id="sim-query" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sim-candidates">Candidate texts (one per line)</Label>
          <Textarea id="sim-candidates" rows={4} value={candidatesRaw} onChange={(e) => setCandidatesRaw(e.target.value)} />
        </div>
        <Button onClick={run} disabled={loading}>
          {loading ? "Computing..." : "Compute all 3 metrics"}
        </Button>

        {rows && (
          <div className="space-y-3">
            {topDiverges && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
                Cosine and dot product disagree on the top-ranked candidate - a strong sign that magnitude
                (vector length, not direction) is driving the dot-product ranking. This is why normalization
                matters: dot product conflates "similar direction" with "large magnitude".
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {METRICS.map((metric) => (
                <div key={metric} className="rounded-md border border-border p-2">
                  <h4 className="mb-1 text-sm font-semibold capitalize">
                    {metric} ranking {metric === "euclidean" && "(lower = closer)"}
                  </h4>
                  <ol className="space-y-1 text-xs">
                    {rankings[metric].map((r, i) => (
                      <li key={r.text} className="flex items-center justify-between gap-1">
                        <span className="truncate">
                          {i + 1}. {r.text}
                        </span>
                        <Badge variant="outline">{r.scores[metric].toFixed(3)}</Badge>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-2">Candidate</th>
                  <th className="pr-2">Magnitude</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.text} className="border-t border-border">
                    <td className="truncate pr-2">{r.text}</td>
                    <td className="pr-2">{r.magnitude.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
