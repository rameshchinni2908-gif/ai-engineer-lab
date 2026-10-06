import * as React from "react";
import type { Run } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { useSse } from "@/hooks/useSse";
import { useProviderModelStore } from "@/stores/provider-model";

export interface ModeComparisonAppliedParams {
  prompt?: string;
}

export interface ModeComparisonProps {
  onRunComplete?: (runId: string) => void;
  /** Applied from a "Try this" preset. `!== undefined`, never truthiness. */
  appliedParams?: ModeComparisonAppliedParams;
}

type Mode = "json_mode" | "schema_constrained" | "forced_tool";

const MODES: { id: Mode; label: string; glossaryId: string }[] = [
  { id: "json_mode", label: "Free-text JSON prompting / JSON mode", glossaryId: "json-mode" },
  { id: "schema_constrained", label: "Schema-constrained decoding", glossaryId: "constrained-decoding" },
  { id: "forced_tool", label: "Forced tool call", glossaryId: "function-calling" },
];

const SHARED_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["topic", "summary"],
};

interface Trial {
  valid: boolean;
  tokens: number;
  costUsd: number;
}

function useModeTrials(
  mode: Mode,
  providerId: ReturnType<typeof useProviderModelStore.getState>["providerId"],
  model: string,
  prompt: string,
  onRunComplete?: (runId: string) => void,
) {
  const [trials, setTrials] = React.useState<Trial[]>([]);
  const lastRunRef = React.useRef<Run | null>(null);

  const sse = useSse(
    "/api/structured/generate",
    { mode, providerId, model, messages: [{ role: "user", content: prompt }], responseSchema: SHARED_SCHEMA },
    {
      autoStart: false,
      onEvent: (e) => {
        if (e.type === "run_complete") {
          lastRunRef.current = e.run;
          onRunComplete?.(e.run.id);
        }
        if (e.type === "stage" && e.stage === "structured.parsed") {
          const data = e.data as { valid?: boolean; parsed?: boolean };
          const run = lastRunRef.current;
          setTrials((prev) => [
            ...prev,
            { valid: Boolean(data.valid ?? data.parsed), tokens: run?.usage.totalTokens ?? 0, costUsd: run?.cost.totalCostUsd ?? 0 },
          ]);
        }
      },
    },
  );

  return { sse, trials };
}

/** M3: free-text JSON vs JSON mode vs forced-tool, compared on the same schema - validity rate, tokens, cost. */
export function ModeComparison({ onRunComplete, appliedParams }: ModeComparisonProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [prompt, setPrompt] = React.useState("Describe the concept of embeddings as structured JSON.");

  React.useEffect(() => {
    if (appliedParams?.prompt !== undefined) setPrompt(appliedParams.prompt);
  }, [appliedParams]);

  const jsonMode = useModeTrials("json_mode", providerId, model, prompt, onRunComplete);
  const schemaConstrained = useModeTrials("schema_constrained", providerId, model, prompt, onRunComplete);
  const forcedTool = useModeTrials("forced_tool", providerId, model, prompt, onRunComplete);

  const panels = [
    { mode: MODES[0]!, ...jsonMode },
    { mode: MODES[1]!, ...schemaConstrained },
    { mode: MODES[2]!, ...forcedTool },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Three modes compared</CardTitle>
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
          <Label htmlFor="mode-compare-prompt">Prompt (same schema for all three modes)</Label>
          <Textarea id="mode-compare-prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {panels.map(({ mode, sse, trials }) => {
            const validCount = trials.filter((t) => t.valid).length;
            const validityRate = trials.length > 0 ? Math.round((validCount / trials.length) * 100) : null;
            const avgTokens = trials.length > 0 ? Math.round(trials.reduce((a, t) => a + t.tokens, 0) / trials.length) : 0;
            const avgCost = trials.length > 0 ? trials.reduce((a, t) => a + t.costUsd, 0) / trials.length : 0;
            const runEntries = Object.entries(sse.runs);

            return (
              <div key={mode.id} className="space-y-2 rounded-md border border-border p-3">
                <h4 className="text-sm font-semibold">
                  <GlossaryTerm id={mode.glossaryId}>{mode.label}</GlossaryTerm>
                </h4>
                <Button
                  size="sm"
                  onClick={sse.start}
                  disabled={sse.status === "connecting" || sse.status === "streaming"}
                >
                  Run trial ({trials.length} so far)
                </Button>
                <div className="flex flex-wrap gap-1 text-xs">
                  <Badge variant={validityRate === null ? "outline" : validityRate >= 70 ? "success" : "destructive"}>
                    validity: {validityRate === null ? "n/a" : `${validityRate}%`}
                  </Badge>
                  <Badge variant="outline">avg tok: {avgTokens}</Badge>
                  <Badge variant="outline">avg cost: ${avgCost.toFixed(6)}</Badge>
                </div>
                {runEntries.map(([id, r]) => (
                  <StreamingRegion
                    key={id}
                    text={r.tokens.join("") || JSON.stringify(r.run?.output.parsedJson ?? r.run?.output.toolCalls ?? "")}
                    status={r.status === "pending" ? "idle" : r.status}
                    tokenCount={r.run?.usage.outputTokens}
                    label={mode.label}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
