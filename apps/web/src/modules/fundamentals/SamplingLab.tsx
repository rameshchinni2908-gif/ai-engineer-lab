import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import type { GenerationParams, LogProb, SseEvent } from "@ail/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Slider,
} from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";

/** Params a `<PresetPicker>` selection can push into this lab. */
export interface SamplingLabParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  seed?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  n?: number;
  prompt?: string;
}

export interface SamplingLabProps {
  onRunComplete?: (runId: string) => void;
  /** Applied params from a `<PresetPicker>` selection; re-applied whenever a new preset is chosen. */
  appliedParams?: SamplingLabParams;
}

interface LogprobPoint {
  token: string;
  probability: number;
  chosen: boolean;
}

/** Pure-ish helper: builds a probability bar-chart dataset from one logprob entry (chosen token + its alternatives). */
function buildLogprobChartData(lp: LogProb): LogprobPoint[] {
  const points: LogprobPoint[] = [{ token: lp.token, probability: Math.exp(lp.logprob), chosen: true }];
  for (const alt of lp.topAlternatives) {
    points.push({ token: alt.token, probability: Math.exp(alt.logprob), chosen: false });
  }
  return points.sort((a, b) => b.probability - a.probability);
}

function lastLogprob(events: SseEvent[]): LogProb | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "logprobs" && e.logprobs.length > 0) return e.logprobs[e.logprobs.length - 1];
  }
  return undefined;
}

/** M1 sampling lab: the headline temperature/top_p/top_k/penalties/seed/N-samples playground. */
export function SamplingLab({ onRunComplete, appliedParams }: SamplingLabProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [prompt, setPrompt] = React.useState("Explain what a vector database is, in two sentences.");
  const [temperature, setTemperature] = React.useState(0.8);
  const [topP, setTopP] = React.useState(1);
  const [topK, setTopK] = React.useState<number | undefined>(undefined);
  const [maxTokens, setMaxTokens] = React.useState(60);
  const [stop, setStop] = React.useState("");
  const [seed, setSeed] = React.useState<number | undefined>(undefined);
  const [presencePenalty, setPresencePenalty] = React.useState(0);
  const [frequencyPenalty, setFrequencyPenalty] = React.useState(0);
  const [n, setN] = React.useState(1);

  /**
   * Apply a preset's params to the controls. Every check is `!== undefined`, never
   * truthiness: the headline "Temperature 0 vs 1.2" preset sets `temperature: 0`,
   * and `if (appliedParams.temperature)` would silently skip exactly the preset
   * that demonstrates this module's acceptance criterion.
   */
  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.temperature !== undefined) setTemperature(appliedParams.temperature);
    if (appliedParams.topP !== undefined) setTopP(appliedParams.topP);
    if (appliedParams.topK !== undefined) setTopK(appliedParams.topK);
    if (appliedParams.maxTokens !== undefined) setMaxTokens(appliedParams.maxTokens);
    if (appliedParams.seed !== undefined) setSeed(appliedParams.seed);
    if (appliedParams.presencePenalty !== undefined) {
      setPresencePenalty(appliedParams.presencePenalty);
    }
    if (appliedParams.frequencyPenalty !== undefined) {
      setFrequencyPenalty(appliedParams.frequencyPenalty);
    }
    if (appliedParams.n !== undefined) setN(appliedParams.n);
    if (appliedParams.prompt !== undefined) setPrompt(appliedParams.prompt);
  }, [appliedParams]);

  const params: GenerationParams = {
    temperature,
    topP,
    topK,
    maxTokens,
    presencePenalty,
    frequencyPenalty,
    seed,
    stop: stop.trim().length > 0 ? stop.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
  };

  const { status, runs, error, start } = useSse(
    "/api/fundamentals/sample",
    { providerId, model, messages: [{ role: "user", content: prompt }], params, n },
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

  const sampleEntries = Object.entries(runs);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sampling lab</CardTitle>
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
          <Label htmlFor="sampling-prompt">Prompt</Label>
          <textarea
            id="sampling-prompt"
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>
              <GlossaryTerm id="temperature">Temperature</GlossaryTerm>: {temperature.toFixed(2)}
            </Label>
            <Slider value={[temperature]} min={0} max={2} step={0.05} onValueChange={([v]) => setTemperature(v!)} />
          </div>
          <div>
            <Label>
              <GlossaryTerm id="top-p">top_p</GlossaryTerm>: {topP.toFixed(2)}
            </Label>
            <Slider value={[topP]} min={0} max={1} step={0.01} onValueChange={([v]) => setTopP(v!)} />
          </div>
          <div>
            <Label htmlFor="sampling-topk">
              <GlossaryTerm id="top-k">top_k</GlossaryTerm> (optional)
            </Label>
            <Input
              id="sampling-topk"
              type="number"
              min={1}
              placeholder="unset"
              value={topK ?? ""}
              onChange={(e) => setTopK(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="sampling-maxtokens">max_tokens</Label>
            <Input
              id="sampling-maxtokens"
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label>
              <GlossaryTerm id="presence-penalty">Presence penalty</GlossaryTerm>: {presencePenalty.toFixed(1)}
            </Label>
            <Slider
              value={[presencePenalty]}
              min={-2}
              max={2}
              step={0.1}
              onValueChange={([v]) => setPresencePenalty(v!)}
            />
          </div>
          <div>
            <Label>
              <GlossaryTerm id="frequency-penalty">Frequency penalty</GlossaryTerm>: {frequencyPenalty.toFixed(1)}
            </Label>
            <Slider
              value={[frequencyPenalty]}
              min={-2}
              max={2}
              step={0.1}
              onValueChange={([v]) => setFrequencyPenalty(v!)}
            />
          </div>
          <div>
            <Label htmlFor="sampling-stop">
              <GlossaryTerm id="stop-sequence">Stop sequences</GlossaryTerm> (comma-separated)
            </Label>
            <Input id="sampling-stop" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="e.g. END,###" />
          </div>
          <div>
            <Label htmlFor="sampling-seed">
              <GlossaryTerm id="seed">Seed</GlossaryTerm> (optional)
            </Label>
            <Input
              id="sampling-seed"
              type="number"
              placeholder="unset"
              value={seed ?? ""}
              onChange={(e) => setSeed(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="sampling-n">N parallel samples</Label>
            <Input
              id="sampling-n"
              type="number"
              min={1}
              max={10}
              value={n}
              onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <Button onClick={start} disabled={status === "connecting" || status === "streaming"}>
          {status === "connecting" || status === "streaming" ? "Running..." : "Run (Ctrl/Cmd+Enter)"}
        </Button>

        {error && <ErrorState message={error.message} />}

        <div className="space-y-4">
          {sampleEntries.map(([runId, r], i) => {
            const lp = lastLogprob(r.events);
            const chartData = lp ? buildLogprobChartData(lp) : [];
            return (
              <div key={runId} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">Sample {i + 1}</Badge>
                  {r.run && (
                    <>
                      <Badge variant="outline">ttft: {r.run.ttftMs !== undefined ? `${r.run.ttftMs}ms` : "n/a"}</Badge>
                      <Badge variant="outline">
                        tok/s: {r.run.tokensPerSecond !== undefined ? r.run.tokensPerSecond.toFixed(1) : "n/a"}
                      </Badge>
                      <Badge variant="outline">{r.run.usage.outputTokens} output tok</Badge>
                      <Badge variant="outline">${r.run.cost.totalCostUsd.toFixed(6)}</Badge>
                    </>
                  )}
                </div>
                <StreamingRegion
                  text={r.tokens.join("")}
                  status={r.status === "pending" ? "idle" : r.status}
                  tokenCount={r.run?.usage.outputTokens}
                  label={`Sample ${i + 1}`}
                />
                {chartData.length > 0 && (
                  <div className="h-40">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Last token&apos;s <GlossaryTerm id="logprobs">logprob</GlossaryTerm> distribution (chosen vs
                      alternatives)
                    </p>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="token" fontSize={11} />
                        <YAxis domain={[0, 1]} fontSize={11} />
                        <RTooltip formatter={(v: number) => v.toFixed(3)} />
                        <Bar dataKey="probability" fill="currentColor" className="fill-primary" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
