import * as React from "react";
import type { EvalVariant, MetricId } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";
import { useProviderModelStore } from "@/stores/provider-model";

export interface EvalRunnerProps {
  datasetId: string | null;
  onRunComplete?: (runId: string) => void;
  onSuiteComplete?: (suiteResultId: string) => void;
}

const ALL_METRICS: MetricId[] = [
  "exact_match",
  "regex",
  "json_schema_valid",
  "semantic_similarity",
  "llm_judge",
  "pairwise",
  "rag_faithfulness",
  "rag_answer_relevance",
  "rag_context_precision",
  "rag_context_recall",
  "latency",
  "cost",
];

interface VariantRow extends EvalVariant {
  key: string;
}

/** M7 eval runner: prompt-version x model variants, metric selection, streamed progress, and a results matrix with regression highlighting. */
export function EvalRunner({ datasetId, onRunComplete, onSuiteComplete }: EvalRunnerProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);

  const [variants, setVariants] = React.useState<VariantRow[]>([
    { key: "v0", promptVersionId: "", providerId: storeProviderId, model: storeModel },
  ]);
  const [metricIds, setMetricIds] = React.useState<Set<MetricId>>(new Set(["exact_match", "latency", "cost"]));
  const [judgeRubric, setJudgeRubric] = React.useState("");

  const sse = useSse(
    "/api/evals/run",
    {
      datasetId,
      variants: variants.map(({ key: _key, ...v }) => v),
      metricIds: Array.from(metricIds),
      judgeRubric: judgeRubric || undefined,
    },
    { autoStart: false },
  );

  const notifiedRef = React.useRef(new Set<string>());
  const suiteNotifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const [id, r] of Object.entries(sse.runs)) {
      if (r.status === "complete" && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        onRunComplete?.(id);
        const suiteResultId = (r.run?.metadata?.suiteResultId as string) ?? undefined;
        if (suiteResultId && !suiteNotifiedRef.current.has(suiteResultId)) {
          suiteNotifiedRef.current.add(suiteResultId);
          onSuiteComplete?.(suiteResultId);
        }
      }
    }
  }, [sse.runs, onRunComplete, onSuiteComplete]);

  const progressEvent = [...sse.events].reverse().find((e) => e.type === "progress");
  const runEntry = Object.values(sse.runs)[0];
  const suiteResult = runEntry?.run?.output.parsedJson as
    | {
        aggregates: Record<string, number>[];
        regressions: { metricId: string; fromVariantIndex: number; toVariantIndex: number; delta: number }[];
        totalCost: number;
        totalLatencyMs: number;
      }
    | undefined;

  function addVariant(): void {
    setVariants((prev) => [
      ...prev,
      { key: `v${prev.length}`, promptVersionId: "", providerId: storeProviderId, model: storeModel },
    ]);
  }

  function updateVariant(key: string, patch: Partial<EvalVariant>): void {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function toggleMetric(id: MetricId): void {
    setMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canRun = Boolean(datasetId) && variants.every((v) => v.promptVersionId.trim().length > 0) && metricIds.size > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run an eval across prompt versions x models</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!datasetId && <EmptyState title="Select a dataset above first" />}

        <div>
          <h4 className="mb-2 text-sm font-semibold">Variants (variant 0 is the baseline for regression comparisons)</h4>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={v.key} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
                <Badge variant="outline">variant {i}</Badge>
                <div>
                  <Label htmlFor={`pv-${v.key}`}>Prompt version id</Label>
                  <Input
                    id={`pv-${v.key}`}
                    className="w-56"
                    value={v.promptVersionId}
                    onChange={(e) => updateVariant(v.key, { promptVersionId: e.target.value })}
                    placeholder="pv_... (from Prompt Engineering)"
                  />
                </div>
                <ProviderModelSelector
                  providerId={v.providerId}
                  model={v.model}
                  onChange={(next) => updateVariant(v.key, { providerId: next.providerId, model: next.model })}
                />
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2" onClick={addVariant}>
            + Add variant
          </Button>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Metrics</h4>
          <div className="flex flex-wrap gap-2">
            {ALL_METRICS.map((m) => (
              <Button key={m} size="sm" variant={metricIds.has(m) ? "default" : "outline"} onClick={() => toggleMetric(m)} type="button">
                {m}
              </Button>
            ))}
          </div>
        </div>

        {metricIds.has("llm_judge") && (
          <div>
            <Label htmlFor="judge-rubric">Judge rubric (editable)</Label>
            <Textarea
              id="judge-rubric"
              rows={2}
              value={judgeRubric}
              onChange={(e) => setJudgeRubric(e.target.value)}
              placeholder="Default rubric is used if left blank."
            />
          </div>
        )}

        <Button onClick={() => sse.start()} disabled={!canRun || sse.status === "connecting" || sse.status === "streaming"}>
          {sse.status === "connecting" || sse.status === "streaming" ? "Running..." : "Run eval suite"}
        </Button>

        {sse.error && <ErrorState message={sse.error.message} />}
        {progressEvent?.type === "progress" && (
          <p className="text-xs text-muted-foreground">
            Progress: {progressEvent.percent}% {progressEvent.message ? `(${progressEvent.message})` : ""}
          </p>
        )}

        {runEntry && (
          <StreamingRegion
            text={suiteResult ? "Eval suite complete." : ""}
            status={runEntry.status === "pending" ? "idle" : runEntry.status}
            label="Eval suite"
          />
        )}

        {suiteResult && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Total cost: ${suiteResult.totalCost.toFixed(5)}</span>
              <span>Total latency: {suiteResult.totalLatencyMs.toFixed(0)}ms</span>
            </div>
            {suiteResult.regressions.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                {suiteResult.regressions.length} regression(s) detected vs. the baseline (variant 0):{" "}
                {suiteResult.regressions.map((r) => `${r.metricId} (variant ${r.toVariantIndex}: ${r.delta.toFixed(2)})`).join(", ")}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  {Array.from(metricIds).map((m) => (
                    <TableHead key={m}>{m}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suiteResult.aggregates.map((agg, i) => {
                  const isRegressed = suiteResult.regressions.some((r) => r.toVariantIndex === i);
                  return (
                    <TableRow key={i} className={isRegressed ? "bg-destructive/10" : undefined}>
                      <TableCell>variant {i}</TableCell>
                      {Array.from(metricIds).map((m) => {
                        const regressedHere = suiteResult.regressions.some((r) => r.toVariantIndex === i && r.metricId === m);
                        return (
                          <TableCell key={m} className={regressedHere ? "font-semibold text-destructive" : undefined}>
                            {agg[m] !== undefined ? agg[m]!.toFixed(2) : "-"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
