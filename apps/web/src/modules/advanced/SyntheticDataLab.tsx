import * as React from "react";
import { Button, Textarea, Input, Label, Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { useSse } from "@/hooks/useSse";

const DEFAULT_SEEDS = JSON.stringify(
  [
    { question: "What does TTFT stand for?", answer: "Time to first token." },
    { question: "What does a circuit breaker protect against?", answer: "Sustained outages, by stopping traffic for a cooldown period." },
  ],
  null,
  2,
);

interface ExampleStageData {
  index: number;
  example: Record<string, unknown>;
}
interface FilterStageData {
  requested: number;
  kept: number;
  droppedDuplicates: number;
  droppedTooShort: number;
  note: string;
}

/**
 * M10 synthetic data: generation (one real call per example, streamed),
 * dedup, and quality filtering, with the risks (mode collapse, bias
 * amplification) made CONCRETE - filtered-out duplicates/too-short examples
 * are shown, not just described abstractly.
 */
export function SyntheticDataLab(): JSX.Element {
  const [seedExamples, setSeedExamples] = React.useState(DEFAULT_SEEDS);
  const [count, setCount] = React.useState(5);
  const [parseError, setParseError] = React.useState<string>();

  const { status, events, start } = useSse("/api/advanced/synthetic-data", {
    seedExamples: (() => {
      try {
        return JSON.parse(seedExamples);
      } catch {
        return [];
      }
    })(),
    count,
    providerId: "mock",
    model: "mock-small",
  });

  function handleRun(): void {
    try {
      const parsed = JSON.parse(seedExamples);
      if (!Array.isArray(parsed)) throw new Error("Seed examples must be a JSON array");
      setParseError(undefined);
      start();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  const exampleEvents = events.filter(
    (e): e is Extract<typeof e, { type: "stage" }> & { data: ExampleStageData } =>
      e.type === "stage" && e.stage === "synthetic.example",
  );
  const filterEvent = events.find(
    (e): e is Extract<typeof e, { type: "stage" }> & { data: FilterStageData } =>
      e.type === "stage" && e.stage === "synthetic.filtered",
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="seed-examples">Seed examples (JSON array)</Label>
        <Textarea id="seed-examples" value={seedExamples} onChange={(e) => setSeedExamples(e.target.value)} rows={5} />
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="synth-count">Count</Label>
          <Input
            id="synth-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <Button onClick={handleRun} disabled={status === "connecting" || status === "streaming"}>
          Generate, dedup, and filter
        </Button>
      </div>
      {parseError && <p className="text-sm text-destructive" role="alert">{parseError}</p>}

      <ol className="space-y-1" aria-label="Generated examples, streaming">
        {exampleEvents.map((e) => (
          <li key={e.data.index} className="rounded-md border border-border p-2 text-xs">
            <span className="font-medium">#{e.data.index + 1}</span>{" "}
            <code className="text-muted-foreground">{JSON.stringify(e.data.example)}</code>
          </li>
        ))}
      </ol>

      {filterEvent && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Dedup + quality filter results (the risk made concrete)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Requested: {filterEvent.data.requested}</Badge>
              <Badge variant="success">Kept: {filterEvent.data.kept}</Badge>
              <Badge variant={filterEvent.data.droppedDuplicates > 0 ? "destructive" : "outline"}>
                Dropped as duplicate (mode collapse signal): {filterEvent.data.droppedDuplicates}
              </Badge>
              <Badge variant={filterEvent.data.droppedTooShort > 0 ? "warning" : "outline"}>
                Dropped as too short: {filterEvent.data.droppedTooShort}
              </Badge>
            </div>
            <p className="text-muted-foreground">{filterEvent.data.note}</p>
            <p className="text-xs text-muted-foreground">
              Bias amplification risk: every kept example came from the SAME small seed set and
              provider - training on a larger synthetic batch like this without diverse seeds
              would amplify whatever skew already exists in those seeds, not correct for it.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
