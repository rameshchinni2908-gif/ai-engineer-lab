import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { EvalVariant, MetricId } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";
import { useProviderModelStore } from "@/stores/provider-model";
import { listPromptVersions } from "@/modules/prompting/api";

/** Preset-applicable params. A prompt-version id can't be meaningfully preset (it's whatever the user created in Prompt Engineering), so presets instead control what's actually observable here: which metrics are selected and how many variant rows exist. */
export interface EvalRunnerParams {
  metricIds?: MetricId[];
  judgeRubric?: string;
  variantCount?: number;
}

export interface EvalRunnerProps {
  datasetId: string | null;
  onRunComplete?: (runId: string) => void;
  onSuiteComplete?: (suiteResultId: string) => void;
  appliedParams?: EvalRunnerParams;
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
export function EvalRunner({ datasetId, onRunComplete, onSuiteComplete, appliedParams }: EvalRunnerProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const promptVersions = useQuery({ queryKey: ["eval-prompt-versions"], queryFn: () => listPromptVersions() });

  const [variants, setVariants] = React.useState<VariantRow[]>([
    { key: "v0", promptVersionId: "", providerId: storeProviderId, model: storeModel },
  ]);
  const [metricIds, setMetricIds] = React.useState<Set<MetricId>>(new Set(["exact_match", "latency", "cost"]));
  const [judgeRubric, setJudgeRubric] = React.useState("");

  // `!== undefined` throughout, never truthiness - `variantCount: 0` or an
  // empty `metricIds` array would be silently skipped by a truthy check.
  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.metricIds !== undefined) {
      setMetricIds(new Set(appliedParams.metricIds));
    }
    if (appliedParams.judgeRubric !== undefined) {
      setJudgeRubric(appliedParams.judgeRubric);
    }
    if (appliedParams.variantCount !== undefined) {
      const count = Math.max(1, appliedParams.variantCount);
      setVariants((prev) => {
        if (count <= prev.length) return prev.slice(0, count);
        const next = [...prev];
        while (next.length < count) {
          next.push({ key: `v${next.length}`, promptVersionId: "", providerId: storeProviderId, model: storeModel });
        }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeProviderId/storeModel are only used to seed NEW rows when growing; re-running this effect on their change (rather than only on appliedParams) would re-apply a stale preset on every provider/model switch.
  }, [appliedParams]);

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
                  {(promptVersions.data?.items.length ?? 0) > 0 && (
                    <Select value={v.promptVersionId || undefined} onValueChange={(promptVersionId) => updateVariant(v.key, { promptVersionId })}>
                      <SelectTrigger className="mt-2 w-56" aria-label={`Choose saved prompt for variant ${i}`}>
                        <SelectValue placeholder="Choose a saved prompt" />
                      </SelectTrigger>
                      <SelectContent>
                        {promptVersions.data?.items.map(prompt => <SelectItem key={prompt.id} value={prompt.id}>{prompt.name} (v{prompt.version})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
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

        {(metricIds.has("rag_faithfulness") ||
          metricIds.has("rag_answer_relevance") ||
          metricIds.has("rag_context_precision") ||
          metricIds.has("rag_context_recall")) && (
          <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
            Simulated, for intuition only - the four RAG metrics are deterministic lexical-overlap
            heuristics (word-set overlap between output/context/query), not a real NLI-based
            faithfulness or relevance model. They work offline with zero keys but should not be
            read as ground truth.
          </p>
        )}

        {(metricIds.has("llm_judge") || metricIds.has("pairwise")) &&
          variants.some((v) => v.providerId === "mock") && (
            <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
              Simulated, for intuition only - at least one variant uses the mock provider, whose
              templated text has no real relationship to the judge prompt. For those variants,
              <code> llm_judge</code>/<code>pairwise</code> scores come from a lexical-overlap
              heuristic against the expected answer, not a real semantic judgment. Select a real
              provider/model for an actual LLM-as-judge call.
            </p>
          )}

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
