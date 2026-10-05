import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import type { MetricId } from "@ail/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { ciCheck } from "./api";

export interface CiGatePanelProps {
  suiteResultId: string | null;
}

/** M7 CI regression gate: same check the `evals:ci` CLI uses, runnable in-app and documented for pipeline use. */
export function CiGatePanel({ suiteResultId }: CiGatePanelProps): JSX.Element {
  const [thresholds, setThresholds] = React.useState<Record<string, string>>({ exact_match: "0.8" });
  const mutation = useMutation({
    mutationFn: () => {
      if (!suiteResultId) throw new Error("Run an eval suite first");
      const parsed: Partial<Record<MetricId, number>> = {};
      for (const [k, v] of Object.entries(thresholds)) {
        const n = Number(v);
        if (k && !Number.isNaN(n)) parsed[k as MetricId] = n;
      }
      return ciCheck(suiteResultId, parsed);
    },
  });

  if (!suiteResultId) {
    return <EmptyState title="Run an eval suite in the Playground tab first" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CI regression gate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The same check backs both this banner and the CI CLI: <code>pnpm --filter @ail/api evals:ci -- --suite{" "}
          {suiteResultId} --threshold exact_match=0.8</code> exits non-zero on regression, zero when clean.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="ci-metric">Metric</Label>
            <Input id="ci-metric" value={Object.keys(thresholds)[0] ?? ""} onChange={(e) => setThresholds({ [e.target.value]: Object.values(thresholds)[0] ?? "0.8" })} className="w-40" />
          </div>
          <div>
            <Label htmlFor="ci-threshold">Threshold</Label>
            <Input
              id="ci-threshold"
              type="number"
              step="0.05"
              value={Object.values(thresholds)[0] ?? "0.8"}
              onChange={(e) => setThresholds({ [Object.keys(thresholds)[0] ?? "exact_match"]: e.target.value })}
              className="w-24"
            />
          </div>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Check
          </Button>
        </div>
        {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
        {mutation.data && (
          <div className={`rounded-md border p-2 text-sm ${mutation.data.pass ? "border-emerald-500/50 bg-emerald-500/10" : "border-destructive/50 bg-destructive/10"}`}>
            <p className="font-medium">{mutation.data.pass ? "PASS" : "FAIL"}</p>
            {mutation.data.failures.map((f, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                variant {f.variantIndex}: {f.metricId} scored {f.score.toFixed(2)} (threshold {f.threshold})
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
