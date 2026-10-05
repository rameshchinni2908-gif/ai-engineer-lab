import * as React from "react";
import type { GenerationParams, SseEvent } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";

export interface TechniqueDemosProps {
  onRunComplete?: (runId: string) => void;
}

type Technique = "zero-shot" | "few-shot" | "cot" | "self-consistency" | "role" | "xml-delimiters" | "prefill" | "chaining";

const TECHNIQUES: { id: Technique; label: string; glossaryId: string }[] = [
  { id: "zero-shot", label: "Zero-shot", glossaryId: "zero-shot-prompting" },
  { id: "few-shot", label: "Few-shot", glossaryId: "few-shot-prompting" },
  { id: "cot", label: "Chain-of-thought", glossaryId: "chain-of-thought" },
  { id: "self-consistency", label: "Self-consistency (5 votes)", glossaryId: "self-consistency" },
  { id: "role", label: "Role prompting", glossaryId: "role-prompting" },
  { id: "xml-delimiters", label: "XML delimiters", glossaryId: "delimiter" },
  { id: "prefill", label: "Assistant prefill", glossaryId: "prefill" },
  { id: "chaining", label: "Prompt chaining", glossaryId: "prompt-chaining" },
];

interface VoteStageData {
  answers: string[];
  votes: Record<string, number>;
  majority: string;
}

function isVoteStage(e: SseEvent): e is SseEvent & { type: "stage"; stage: "self-consistency.vote"; data: VoteStageData } {
  return e.type === "stage" && e.stage === "self-consistency.vote";
}

/** M2 technique demos: zero/few-shot, CoT, self-consistency (vote distribution), role, XML delimiters, prefill, chaining. */
export function TechniqueDemos({ onRunComplete }: TechniqueDemosProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [technique, setTechnique] = React.useState<Technique>("cot");
  const [input, setInput] = React.useState("If a train travels 60 miles in 1.5 hours, what is its average speed?");
  const [compareBaseline, setCompareBaseline] = React.useState(true);

  const params: GenerationParams = { temperature: 0.7, maxTokens: 120 };

  const main = useSse(
    "/api/prompting/technique-demo",
    { technique, input, providerId, model, params },
    { autoStart: false },
  );
  const baseline = useSse(
    "/api/prompting/technique-demo",
    { technique: "zero-shot", input, providerId, model, params },
    { autoStart: false },
  );

  function run(): void {
    main.start();
    if (compareBaseline && technique !== "zero-shot") baseline.start();
  }
  useRunShortcut(run);

  const notifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const hook of [main, baseline]) {
      for (const [id, r] of Object.entries(hook.runs)) {
        if (r.status === "complete" && !notifiedRef.current.has(id)) {
          notifiedRef.current.add(id);
          onRunComplete?.(id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `main`/`baseline` are useSse return values, not stable refs; re-run on their .runs changing is the intent
  }, [main.runs, baseline.runs, onRunComplete]);

  const voteStage = main.events.find(isVoteStage);
  const mainRunEntries = Object.entries(main.runs);
  const stageEvents = main.events.filter((e) => e.type === "stage" && e.stage.startsWith("chaining."));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technique demos</CardTitle>
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
          <Label htmlFor="technique-select">Technique</Label>
          <Select value={technique} onValueChange={(v) => setTechnique(v as Technique)}>
            <SelectTrigger id="technique-select" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TECHNIQUES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="technique-input">Input</Label>
          <textarea
            id="technique-input"
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Switch
            id="compare-baseline-switch"
            checked={compareBaseline}
            onCheckedChange={setCompareBaseline}
            disabled={technique === "zero-shot"}
          />
          <Label htmlFor="compare-baseline-switch">Compare against a zero-shot baseline</Label>
        </div>

        <Button onClick={run} disabled={main.status === "connecting" || main.status === "streaming"}>
          {main.status === "connecting" || main.status === "streaming" ? "Running..." : "Run (Ctrl/Cmd+Enter)"}
        </Button>

        {main.error && <ErrorState message={main.error.message} />}

        {technique === "chaining" && stageEvents.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {stageEvents.map((e, i) =>
              e.type === "stage" ? (
                <Badge key={i} variant="outline">
                  step: {e.stage.replace("chaining.", "")}
                </Badge>
              ) : null,
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {mainRunEntries.map(([runId, r], i) => (
            <StreamingRegion
              key={runId}
              text={r.tokens.join("")}
              status={r.status === "pending" ? "idle" : r.status}
              tokenCount={r.run?.usage.outputTokens}
              label={
                technique === "self-consistency"
                  ? `Sample ${i + 1}`
                  : technique === "chaining"
                    ? `Step ${i + 1}`
                    : TECHNIQUES.find((t) => t.id === technique)?.label ?? "Technique"
              }
            />
          ))}
        </div>

        {voteStage && voteStage.type === "stage" && (
          <div className="rounded-md border border-border p-3">
            <h4 className="mb-2 text-sm font-semibold">
              <GlossaryTerm id="self-consistency">Majority vote</GlossaryTerm>: {voteStage.data.majority}
            </h4>
            <ul className="space-y-1 text-sm">
              {Object.entries(voteStage.data.votes).map(([answer, count]) => (
                <li key={answer} className="flex items-center gap-2">
                  <Badge variant={answer === voteStage.data.majority ? "default" : "outline"}>{count}x</Badge>
                  <span className="font-mono text-xs">{answer}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {compareBaseline && technique !== "zero-shot" && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Zero-shot baseline</h4>
            {baseline.error && <ErrorState message={baseline.error.message} />}
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(baseline.runs).map(([runId, r]) => (
                <StreamingRegion
                  key={runId}
                  text={r.tokens.join("")}
                  status={r.status === "pending" ? "idle" : r.status}
                  tokenCount={r.run?.usage.outputTokens}
                  label="Zero-shot baseline"
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
