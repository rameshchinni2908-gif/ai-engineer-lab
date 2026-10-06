import * as React from "react";
import type { IndexKind } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { EmptyState } from "@/components/EmptyState";
import { embeddingsApi } from "./api";
import type { EmbeddingsPresetParams } from "./presetTypes";

const EMBED_DIM = 64;
const CORPUS_SIZE = 60;
const QUERY_COUNT = 10;

interface RunResult {
  kind: IndexKind;
  label: string;
  recallPct: number;
  avgLatencyMs: number;
}

function syntheticVector(seed: number): number[] {
  const vec = new Array(EMBED_DIM).fill(0).map((_, i) => Math.sin(seed * 0.173 + i * 0.911));
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * M4: index trade-offs - Flat vs HNSW vs IVF measured against Flat as exact
 * ground truth. The underlying ANN behaviour is SIMULATED server-side
 * (`stores/vector/ann-simulation.ts`) - this demo measures the real,
 * genuinely-different latency/recall numbers that simulation produces, but
 * the mechanism itself is a teaching approximation, not a real ANN index.
 */
export interface IndexTradeoffsProps {
  appliedParams?: EmbeddingsPresetParams;
}

export function IndexTradeoffs({ appliedParams }: IndexTradeoffsProps): JSX.Element {
  const [m, setM] = React.useState(16);
  const [efConstruct, setEfConstruct] = React.useState(100);
  const [efSearch, setEfSearch] = React.useState(50);
  const [nlist, setNlist] = React.useState(20);
  const [nprobe, setNprobe] = React.useState(4);
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<RunResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.efSearch !== undefined) setEfSearch(appliedParams.efSearch);
    if (appliedParams.nprobe !== undefined) setNprobe(appliedParams.nprobe);
  }, [appliedParams]);

  const run = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const suffix = Date.now();
      const configs: { kind: IndexKind; label: string; index?: Record<string, number> }[] = [
        { kind: "flat", label: "Flat (ground truth)" },
        { kind: "hnsw", label: `HNSW (m=${m}, efSearch=${efSearch})`, index: { m, efConstruct, efSearch } },
        { kind: "ivf", label: `IVF (nlist=${nlist}, nprobe=${nprobe})`, index: { nlist, nprobe } },
      ];

      const corpus = Array.from({ length: CORPUS_SIZE }, (_, i) => ({ id: `v${i}`, vector: syntheticVector(i), metadata: {} }));
      const queries = Array.from({ length: QUERY_COUNT }, (_, i) => syntheticVector(i * 7 + 1000));

      const out: RunResult[] = [];
      let groundTruth: string[][] = [];

      for (const cfg of configs) {
        const name = `idx-tradeoff-${cfg.kind}-${suffix}`;
        await embeddingsApi.createCollection(name, EMBED_DIM, {
          distance: "cosine",
          index: { kind: cfg.kind, ...cfg.index },
        });
        await embeddingsApi.upsert(name, corpus);

        const perQueryIds: string[][] = [];
        const latencies: number[] = [];
        for (const q of queries) {
          const start = performance.now();
          const { hits } = await embeddingsApi.search(name, q, { topK: 10 });
          latencies.push(performance.now() - start);
          perQueryIds.push(hits.map((h) => h.id));
        }

        if (cfg.kind === "flat") {
          groundTruth = perQueryIds;
          out.push({ kind: cfg.kind, label: cfg.label, recallPct: 100, avgLatencyMs: avg(latencies) });
        } else {
          const recalls = perQueryIds.map((ids, i) => {
            const truth = new Set(groundTruth[i]);
            const hit = ids.filter((id) => truth.has(id)).length;
            return truth.size > 0 ? hit / truth.size : 1;
          });
          out.push({ kind: cfg.kind, label: cfg.label, recallPct: avg(recalls) * 100, avgLatencyMs: avg(latencies) });
        }
        await embeddingsApi.deleteCollection(name);
      }
      setResults(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Index trade-off run failed");
    } finally {
      setRunning(false);
    }
  }, [m, efConstruct, efSearch, nlist, nprobe]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Index trade-offs: Flat vs <GlossaryTerm id="hnsw">HNSW</GlossaryTerm> vs <GlossaryTerm id="ivf">IVF</GlossaryTerm>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Simulated figures: this app does not implement a real ANN index. Recall/latency numbers below are
          measured end-to-end against a server-side simulation that deterministically trades recall for speed
          based on the parameters you set, for teaching purposes only.
        </p>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <Label htmlFor="idx-m">HNSW m</Label>
            <Input id="idx-m" type="number" value={m} onChange={(e) => setM(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="idx-efc">efConstruct</Label>
            <Input id="idx-efc" type="number" value={efConstruct} onChange={(e) => setEfConstruct(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="idx-efs">efSearch</Label>
            <Input id="idx-efs" type="number" value={efSearch} onChange={(e) => setEfSearch(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="idx-nlist">IVF nlist</Label>
            <Input id="idx-nlist" type="number" value={nlist} onChange={(e) => setNlist(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="idx-nprobe">nprobe</Label>
            <Input id="idx-nprobe" type="number" value={nprobe} onChange={(e) => setNprobe(Number(e.target.value))} />
          </div>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? "Running comparison..." : "Run Flat vs HNSW vs IVF comparison"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!results ? (
          <EmptyState title="No comparison run yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Index</th>
                <th>Recall vs Flat</th>
                <th>Avg latency (measured)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.kind} className="border-t border-border">
                  <td className="py-1">{r.label}</td>
                  <td>
                    <Badge variant={r.recallPct >= 90 ? "success" : r.recallPct >= 70 ? "warning" : "destructive"}>
                      {r.recallPct.toFixed(1)}%
                    </Badge>
                  </td>
                  <td>{r.avgLatencyMs.toFixed(1)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}
