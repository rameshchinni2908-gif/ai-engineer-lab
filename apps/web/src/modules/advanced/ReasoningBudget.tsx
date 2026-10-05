import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";
import { advancedApi } from "./api";

export interface ReasoningBudgetProps {
  onRunComplete: (runId: string) => void;
}

const HARD_PROBLEM =
  "A train leaves station A at 60mph heading toward station B, 300 miles away. 45 minutes later a second train leaves station B heading toward station A at 75mph. How far from station A do they meet, and at what time after the first train departed?";

/**
 * M10 reasoning models + thinking budgets. Per contracts.md §4 M10, this
 * reuses M1's `/fundamentals/sample` directly (no separate `/advanced`
 * generation route) with `params.thinkingBudget` set from the chosen
 * preset - the budget/quality/cost/latency trade-off is then visible via
 * the real recorded Run (Run Inspector's Usage & Cost / Latency tabs).
 */
export function ReasoningBudget({ onRunComplete }: ReasoningBudgetProps): JSX.Element {
  const presetsQuery = useQuery({ queryKey: ["advanced", "reasoning-presets"], queryFn: advancedApi.reasoningPresets });
  const [presetId, setPresetId] = React.useState<string>();
  const preset = presetsQuery.data?.presets.find((p) => p.id === presetId) ?? presetsQuery.data?.presets[0];

  const { status, runs, start } = useSse(
    preset ? "/api/fundamentals/sample" : null,
    preset
      ? {
          providerId: preset.providerId,
          model: preset.model,
          messages: [{ role: "user", content: HARD_PROBLEM }],
          params: { temperature: 0.2, thinkingBudget: preset.thinkingBudget },
        }
      : null,
  );
  const run = Object.values(runs)[0];

  React.useEffect(() => {
    if (run?.status === "complete" && run.run) onRunComplete(run.run.id);
  }, [run, onRunComplete]);

  if (presetsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading presets...</p>;
  if (presetsQuery.isError) return <ErrorState message="Could not load reasoning presets." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Same multi-step word problem, different thinking budgets. Compare cost/latency (Run
        Inspector) across presets - more budget costs more and is not guaranteed to help past a
        task-dependent point.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="reasoning-preset" className="mb-1 block text-xs font-medium">Thinking budget preset</label>
          <Select value={preset?.id} onValueChange={setPresetId}>
            <SelectTrigger id="reasoning-preset" className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {presetsQuery.data!.presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={start} disabled={status === "connecting" || status === "streaming"}>Run</Button>
      </div>

      <StreamingRegion
        text={run?.tokens.join("") ?? ""}
        status={run?.status === "pending" ? "idle" : run?.status ?? "idle"}
        label="Reasoning run"
      />

      {run?.run && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Measured trade-off (this run)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Thinking budget</div><div>{preset?.thinkingBudget}</div></div>
            <div><div className="text-xs text-muted-foreground">Latency</div><div>{run.run.latencyMs}ms</div></div>
            <div><div className="text-xs text-muted-foreground">Cost</div><div>${run.run.cost.totalCostUsd.toFixed(4)}</div></div>
            <div><div className="text-xs text-muted-foreground">Output tokens</div><div>{run.run.usage.outputTokens}</div></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
