import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { EmptyState } from "@/components/EmptyState";
import type { FailureMode } from "./api";
import { ragApi } from "./api";

const MODES: { id: FailureMode; label: string; glossaryId?: string }[] = [
  { id: "miss", label: "Retrieval miss" },
  { id: "ignored", label: "Ignored context" },
  { id: "lost-in-middle", label: "Lost in the middle", glossaryId: "lost-in-the-middle" },
  { id: "stale", label: "Stale index" },
];

export interface FailureModeLabProps {
  collection: string;
  onRunComplete?: (runId: string) => void;
}

/** M5: failure-mode lab - deliberately reproduces each named failure, with a diagnosis tied to the real run and a re-runnable fix. */
export function FailureModeLab({ collection, onRunComplete }: FailureModeLabProps): JSX.Element {
  const [query, setQuery] = React.useState("What does the document say?");
  const [mode, setMode] = React.useState<FailureMode | null>(null);
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof ragApi.failureModeDemo>> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function trigger(m: FailureMode) {
    setMode(m);
    setLoading(true);
    setError(null);
    try {
      const r = await ragApi.failureModeDemo(m, query, collection);
      setResult(r);
      onRunComplete?.(r.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failure-mode demo failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Failure-mode lab</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Each button deliberately engineers one real RAG failure against your own indexed collection, then
          shows a diagnosis tied to THIS run's actual numbers and a concrete fix you can apply and re-run.
        </p>
        <div>
          <Label htmlFor="fm-query">Query</Label>
          <Input id="fm-query" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <Button key={m.id} size="sm" variant={mode === m.id ? "default" : "secondary"} onClick={() => trigger(m.id)} disabled={loading}>
              {m.glossaryId ? <GlossaryTerm id={m.glossaryId}>{m.label}</GlossaryTerm> : m.label}
            </Button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!result ? (
          <EmptyState title="No failure mode triggered yet" description="Click one of the buttons above." />
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <h4 className="text-sm font-semibold">Diagnosis</h4>
              <p className="text-sm">{result.diagnosis}</p>
            </div>
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
              <h4 className="text-sm font-semibold">Fix (apply it, then re-run)</h4>
              <p className="text-sm">{result.fix}</p>
            </div>
            <div className="rounded-md border border-border p-2 text-xs">
              <h4 className="mb-1 font-semibold">Retrieval debug for this run</h4>
              {result.retrievalDebug.stages.map((s, i) => (
                <div key={i} className="border-t border-border pt-1">
                  <Badge variant="outline">{s.stage}</Badge> {s.candidates.length} candidate(s), {s.timingMs.toFixed(1)}ms
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Answer: {result.run.output.text.slice(0, 300)}
              {result.run.output.text.length > 300 ? "..." : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
