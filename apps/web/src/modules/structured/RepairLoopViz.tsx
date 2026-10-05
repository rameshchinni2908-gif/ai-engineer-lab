import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";

export interface RepairLoopVizProps {
  onRunComplete?: (runId: string) => void;
}

const DEFAULT_INVALID_JSON = '{"topic": "embeddings", "summry": "typo'; // deliberately malformed + misspelled field
const DEFAULT_SCHEMA = JSON.stringify(
  { type: "object", properties: { topic: { type: "string" }, summary: { type: "string" } }, required: ["topic", "summary"] },
  null,
  2,
);

interface AttemptStageData {
  attempt: number;
  valid: boolean;
  errors: { path: string; message: string }[];
}

/** M3 retry/repair loop timeline: every attempt, the validation errors fed back, and the (possibly still-invalid) result. */
export function RepairLoopViz({ onRunComplete }: RepairLoopVizProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [invalidJson, setInvalidJson] = React.useState(DEFAULT_INVALID_JSON);
  const [schemaText, setSchemaText] = React.useState(DEFAULT_SCHEMA);
  const [maxAttempts, setMaxAttempts] = React.useState(3);
  const [schemaError, setSchemaError] = React.useState<string | null>(null);

  const schema = React.useMemo(() => {
    try {
      const parsed = JSON.parse(schemaText);
      setSchemaError(null);
      return parsed;
    } catch (e) {
      setSchemaError((e as Error).message);
      return {};
    }
  }, [schemaText]);

  const { status, runs, error, start } = useSse(
    "/api/structured/repair",
    { invalidJson, schema, providerId, model, maxAttempts },
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

  const steps = Object.entries(runs)
    .map(([runId, r]) => {
      const stageEvent = r.events.find((e) => e.type === "stage" && e.stage === "repair.attempt");
      const data = stageEvent?.type === "stage" ? (stageEvent.data as AttemptStageData) : undefined;
      return { runId, r, data };
    })
    .filter((s) => s.data !== undefined)
    .sort((a, b) => (a.data!.attempt ?? 0) - (b.data!.attempt ?? 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Retry/<GlossaryTerm id="schema-repair">repair</GlossaryTerm> loop
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="repair-invalid-json">Invalid JSON to repair</Label>
            <Textarea id="repair-invalid-json" rows={3} value={invalidJson} onChange={(e) => setInvalidJson(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="repair-schema">Target schema</Label>
            <Textarea id="repair-schema" rows={3} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} />
            {schemaError && <p className="text-xs text-destructive">{schemaError}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="repair-max-attempts">Max attempts</Label>
          <Input
            id="repair-max-attempts"
            type="number"
            min={1}
            max={5}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            className="w-24"
          />
        </div>
        <Button onClick={start} disabled={!!schemaError || status === "connecting" || status === "streaming"}>
          {status === "connecting" || status === "streaming" ? "Repairing..." : "Run repair loop (Ctrl/Cmd+Enter)"}
        </Button>

        {error && <ErrorState message={error.message} />}

        <ol className="space-y-3">
          {steps.map(({ runId, r, data }, i) => (
            <li key={runId} className="rounded-md border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">Attempt {data!.attempt}</Badge>
                <Badge variant={data!.valid ? "success" : "destructive"}>{data!.valid ? "valid" : "invalid"}</Badge>
                {r.run && (
                  <>
                    <Badge variant="outline">{r.run.usage.totalTokens} tok</Badge>
                    <Badge variant="outline">${r.run.cost.totalCostUsd.toFixed(6)}</Badge>
                  </>
                )}
              </div>
              {data!.errors.length > 0 && (
                <ul className="mb-2 list-inside list-disc text-xs text-muted-foreground">
                  {data!.errors.map((e, ei) => (
                    <li key={ei}>
                      <span className="font-mono">{e.path || "$"}</span>: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <StreamingRegion
                text={r.tokens.join("")}
                status={r.status === "pending" ? "idle" : r.status}
                tokenCount={r.run?.usage.outputTokens}
                label={`Repair attempt ${i + 1}`}
              />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
