import * as React from "react";
import type { GenerationParams } from "@ail/shared";
import { MODEL_CATALOG } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Switch } from "@/components/ui";
import { StreamingRegion } from "@/components/StreamingRegion";
import { ErrorState } from "@/components/EmptyState";
import { PricingDisclosure } from "@/components/PricingDisclosure";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";

export interface ModelComparisonProps {
  onRunComplete?: (runId: string) => void;
}

const DEFAULT_SELECTION = ["mock-small", "mock-large"];

/** M1 model comparison: same prompt across 2-3 models, demuxed on one SSE connection. */
export function ModelComparison({ onRunComplete }: ModelComparisonProps): JSX.Element {
  const [selected, setSelected] = React.useState<string[]>(DEFAULT_SELECTION);
  const [prompt, setPrompt] = React.useState("Summarize the tradeoffs between RAG and fine-tuning in 3 sentences.");

  const models = selected
    .map((id) => MODEL_CATALOG.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)
    .map((m) => ({ providerId: m.providerId, model: m.id }));

  const params: GenerationParams = { temperature: 0.7, maxTokens: 120 };

  const { status, runs, error, start } = useSse(
    "/api/fundamentals/compare-models",
    { models, messages: [{ role: "user", content: prompt }], params },
    { autoStart: false },
  );
  useRunShortcut(start);

  const notifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const [id, r] of Object.entries(runs)) {
      if (r.status === "complete" && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        onRunComplete?.(id);
      }
    }
  }, [runs, onRunComplete]);

  function toggle(id: string): void {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="compare-prompt" className="text-sm font-medium">
            Prompt
          </label>
          <textarea
            id="compare-prompt"
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Pick 2-3 models</p>
          <div className="flex flex-wrap gap-3">
            {MODEL_CATALOG.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={selected.includes(m.id)}
                  onCheckedChange={() => toggle(m.id)}
                  disabled={!selected.includes(m.id) && selected.length >= 3}
                  aria-label={m.displayName}
                />
                {m.displayName}
              </label>
            ))}
          </div>
          <PricingDisclosure />
        </div>

        <Button onClick={start} disabled={models.length < 2 || status === "connecting" || status === "streaming"}>
          {status === "connecting" || status === "streaming" ? "Running..." : "Compare (Ctrl/Cmd+Enter)"}
        </Button>
        {models.length < 2 && <p className="text-xs text-muted-foreground">Select at least 2 models to compare.</p>}

        {error && <ErrorState message={error.message} />}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(runs).map(([runId, r]) => {
            const modelLabel = MODEL_CATALOG.find((m) => m.id === r.run?.model)?.displayName ?? r.run?.model;
            return (
              <div key={runId} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <Badge variant="outline">{modelLabel ?? "..."}</Badge>
                  {r.run && (
                    <>
                      <Badge variant="outline">{r.run.latencyMs}ms</Badge>
                      <Badge variant="outline">${r.run.cost.totalCostUsd.toFixed(6)}</Badge>
                      <Badge variant="outline">{r.run.usage.outputTokens} out tok</Badge>
                    </>
                  )}
                </div>
                <StreamingRegion
                  text={r.tokens.join("")}
                  status={r.status === "pending" ? "idle" : r.status}
                  tokenCount={r.run?.usage.outputTokens}
                  label={modelLabel ?? "Model"}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
