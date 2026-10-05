import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";
import { productionApi } from "./api";

export interface LatencyLabProps {
  onRunComplete: (runId: string) => void;
}

/**
 * M9 Latency Lab: where time actually goes (TTFT vs. generation) for a real
 * streamed run. Uses the shared `useSse` hook against the thin
 * `/production/latency-lab/run` wrapper (reuses backend-core's generation
 * service, per contracts.md §4 M9). `ttftMs`/`tokensPerSecond` on the
 * completed `Run` (visible via Run Inspector -> Latency tab) come from REAL
 * recorded spans/timings, not an estimate.
 */
export function LatencyLab({ onRunComplete }: LatencyLabProps): JSX.Element {
  const presetsQuery = useQuery({
    queryKey: ["production", "latency-presets"],
    queryFn: () => productionApi.latencyPresets(),
  });
  const [presetId, setPresetId] = React.useState<string>();

  const preset = presetsQuery.data?.presets.find((p) => p.id === presetId) ?? presetsQuery.data?.presets[0];

  const { status, runs, start } = useSse(
    preset ? "/api/production/latency-lab/run" : null,
    preset
      ? {
          providerId: preset.providerId,
          model: preset.model,
          messages: [{ role: "user", content: "Explain, in a few sentences, where time goes in an LLM request." }],
          params: preset.params,
        }
      : null,
  );

  const runEntries = Object.values(runs);
  const activeRun = runEntries[0];

  React.useEffect(() => {
    if (activeRun?.status === "complete" && activeRun.run) onRunComplete(activeRun.run.id);
  }, [activeRun, onRunComplete]);

  if (presetsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading presets...</p>;
  if (presetsQuery.isError) return <ErrorState message="Could not load latency-lab presets." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="latency-preset-select" className="mb-1 block text-xs font-medium">Preset</label>
          <Select value={preset?.id} onValueChange={setPresetId}>
            <SelectTrigger id="latency-preset-select" className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {presetsQuery.data!.presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={start} disabled={status === "connecting" || status === "streaming"}>
          Run and measure
        </Button>
      </div>

      {activeRun && (
        <StreamingRegion
          text={activeRun.tokens.join("")}
          status={activeRun.status === "pending" ? "idle" : activeRun.status}
          label="Latency lab run"
        />
      )}

      {activeRun?.run && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Where the time went (from the real recorded Run)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">TTFT (time to first token)</div>
              <div>{activeRun.run.ttftMs !== undefined ? `${activeRun.run.ttftMs}ms` : "n/a"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total latency</div>
              <div>{activeRun.run.latencyMs}ms</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Generation time (total - TTFT)</div>
              <div>
                {activeRun.run.ttftMs !== undefined ? `${activeRun.run.latencyMs - activeRun.run.ttftMs}ms` : "n/a"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tokens/sec</div>
              <div>{activeRun.run.tokensPerSecond?.toFixed(1) ?? "n/a"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        This lab measures TTFT vs. generation time for a single LLM call. Retrieval time and tool
        time (the other two legs of end-to-end latency) are visible in a RAG/agent run&apos;s own
        span waterfall in the Tracing Dashboard below, broken down by span <code>kind</code>.
      </p>
    </div>
  );
}
