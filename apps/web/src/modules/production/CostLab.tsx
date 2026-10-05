import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import type { Message } from "@ail/shared";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Badge,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import {
  productionApi,
  type CacheType,
  type CacheSimResult,
  type RoutingSimResult,
  type BatchingSimResult,
  type ContextTrimSimResult,
} from "./api";

function Pct({ value }: { value: number }): JSX.Element {
  const positive = value >= 0;
  return (
    <span className={positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
      {positive ? "-" : "+"}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function defaultRequests(): { prompt: string }[] {
  return [
    { prompt: "What is a vector database?" },
    { prompt: "What is a vector database?" },
    { prompt: "Explain retrieval-augmented generation" },
    { prompt: "What is a vector database?" },
    { prompt: "Explain retrieval-augmented generation in detail" },
  ];
}

/** Lever 1/4: caching (prompt / semantic / response). */
function CacheLever(): JSX.Element {
  const [cacheType, setCacheType] = React.useState<CacheType>("prompt");
  const [requestsText, setRequestsText] = React.useState(defaultRequests().map((r) => r.prompt).join("\n"));

  const mutation = useMutation({
    mutationFn: () =>
      productionApi.cacheSim({
        cacheType,
        requests: requestsText
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((prompt) => ({ prompt })),
      }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        One request per line. Repeat a line exactly (prompt cache), with small formatting changes
        (response cache), or as a close paraphrase (
        <GlossaryTerm id="semantic-caching">semantic cache</GlossaryTerm>) to see it hit.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cache-type-select" className="mb-1 block text-xs font-medium">Cache type</label>
          <Select value={cacheType} onValueChange={(v) => setCacheType(v as CacheType)}>
            <SelectTrigger id="cache-type-select" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prompt">Prompt (exact match)</SelectItem>
              <SelectItem value="semantic">Semantic (embedding similarity)</SelectItem>
              <SelectItem value="response">Response (normalized match)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Running both passes..." : "Run cold vs. cached (measured)"}
        </Button>
      </div>
      <Textarea
        value={requestsText}
        onChange={(e) => setRequestsText(e.target.value)}
        rows={6}
        aria-label="Requests, one per line"
      />
      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && <CacheResult result={mutation.data} />}
    </div>
  );
}

function CacheResult({ result }: { result: CacheSimResult }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Measured result (two real passes through the provider)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Without cache</div>
            <div>${result.withoutCache.totalCostUsd.toFixed(4)} · {result.withoutCache.totalLatencyMs}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">With cache</div>
            <div>${result.withCache.totalCostUsd.toFixed(4)} · {result.withCache.totalLatencyMs}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Hits / misses</div>
            <div>{result.hits} / {result.misses}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cost savings (measured)</div>
            <div><Pct value={result.savingsPct} /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Latency savings (measured)</div>
            <div><Pct value={result.latencySavingsPct} /></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{result.assumedVsMeasuredNote}</p>
      </CardContent>
    </Card>
  );
}

/** Lever 2/4: model routing. */
function RoutingLever(): JSX.Element {
  const [strategy, setStrategy] = React.useState<"cheapest" | "complexity-based" | "fallback-chain">(
    "complexity-based",
  );
  const mutation = useMutation({
    mutationFn: () =>
      productionApi.routingSim({
        requests: [
          { prompt: "What's 2+2?", complexity: "low" },
          { prompt: "What's 2+2?", complexity: "low" },
          { prompt: "Design a distributed rate limiter with multi-region consistency trade-offs", complexity: "high" },
        ],
        strategy,
        candidateModels: ["mock-small", "mock-large"],
      }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each request is actually sent to its assigned model (and, separately, to the priciest
        candidate for the baseline) - both costs below are real, measured per-request costs.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="routing-strategy-select" className="mb-1 block text-xs font-medium">Routing strategy</label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
            <SelectTrigger id="routing-strategy-select" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cheapest">Cheapest always</SelectItem>
              <SelectItem value="complexity-based">Complexity-based</SelectItem>
              <SelectItem value="fallback-chain">Fallback chain (escalate on difficulty)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Running..." : "Run routing sim (measured)"}
        </Button>
      </div>
      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && <RoutingResult result={mutation.data} />}
    </div>
  );
}

function RoutingResult({ result }: { result: RoutingSimResult }): JSX.Element {
  const savingsPct =
    result.baselineCostUsd > 0 ? ((result.baselineCostUsd - result.totalCostUsd) / result.baselineCostUsd) * 100 : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Measured result (real call per assignment + real baseline call)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <ul className="space-y-1">
          {result.assignments.map((a) => (
            <li key={a.requestIndex} className="flex justify-between gap-4">
              <span>Request {a.requestIndex + 1}</span>
              <span className="font-mono text-xs">
                <Badge variant="outline">{a.model}</Badge> ${a.costUsd.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 pt-1">
          <div>
            <div className="text-xs text-muted-foreground">Total cost (routed)</div>
            <div>${result.totalCostUsd.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Baseline (priciest model, every request)</div>
            <div>${result.baselineCostUsd.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Savings vs. baseline (measured)</div>
            <div><Pct value={savingsPct} /></div>
          </div>
        </div>
        {result.baselineCostUsd === 0 && (
          <p className="text-xs text-muted-foreground">
            mock-small/mock-large are both free ($0/MTok) - costs are honestly $0 here. Pick real
            paid `candidateModels` ids to see a non-zero dollar delta; the model ASSIGNMENT logic
            above is real either way.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Lever 3/4: batching. */
function BatchingLever(): JSX.Element {
  const [batchSize, setBatchSize] = React.useState(3);
  const mutation = useMutation({
    mutationFn: () =>
      productionApi.batchingSim({
        requests: Array.from({ length: 6 }, (_, i) => ({ prompt: `Question ${i + 1}: summarize batching.` })),
        batchSize,
        providerId: "mock",
        model: "mock-small",
      }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        6 fixed requests. One real provider call per request (unbatched) vs. one real call per
        group of <code>batchSize</code> (batched, concatenated into a single numbered prompt).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="batch-size-select" className="mb-1 block text-xs font-medium">Batch size</label>
          <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
            <SelectTrigger id="batch-size-select" className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Running..." : "Run batching sim (measured)"}
        </Button>
      </div>
      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && <BatchingResult result={mutation.data} />}
    </div>
  );
}

function BatchingResult({ result }: { result: BatchingSimResult }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Measured result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Unbatched</div>
            <div>{result.unbatched.requestCount} calls · ${result.unbatched.totalCostUsd.toFixed(4)} · {result.unbatched.totalLatencyMs}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Batched</div>
            <div>{result.batched.batchCount} calls · ${result.batched.totalCostUsd.toFixed(4)} · {result.batched.totalLatencyMs}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cost savings (measured)</div>
            <div><Pct value={result.savingsPct} /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Latency savings (measured)</div>
            <div><Pct value={result.latencySavingsPct} /></div>
          </div>
        </div>
        {result.savingsPct === 0 && (
          <p className="text-xs text-muted-foreground">
            mock-small is free ($0/MTok) so cost savings are honestly $0 - the fewer-calls effect
            is real either way (see call count and latency savings above).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Lever 4/4: context trimming. */
function TrimmingLever(): JSX.Element {
  const [strategy, setStrategy] = React.useState<"truncate-oldest" | "truncate-middle" | "sliding-window" | "summarize">(
    "truncate-oldest",
  );
  const messages: Message[] = React.useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i + 1}: ${"this is a long-ish conversational turn used to exercise context trimming. ".repeat(10)}`,
      })),
    [],
  );

  const mutation = useMutation({
    mutationFn: () => productionApi.contextTrimSim({ messages, providerId: "mock", model: "mock-small", strategy }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A fixed 10-turn, deliberately overlong conversation. Token counts below are real
        (measured by the approximate tokenizer); cost uses the model&apos;s catalog rate applied
        to those real counts.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="trim-strategy-select" className="mb-1 block text-xs font-medium">Trim strategy</label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
            <SelectTrigger id="trim-strategy-select" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="truncate-oldest">Truncate oldest</SelectItem>
              <SelectItem value="truncate-middle">Truncate middle</SelectItem>
              <SelectItem value="sliding-window">Sliding window</SelectItem>
              <SelectItem value="summarize">Summarize (real LLM call)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Running..." : "Run trim sim (measured tokens)"}
        </Button>
      </div>
      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && <TrimResult result={mutation.data} />}
    </div>
  );
}

function TrimResult({ result }: { result: ContextTrimSimResult }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Measured result (real token counts)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Untrimmed</div>
            <div>{result.untrimmed.inputTokens} tokens · ${result.untrimmed.costUsd.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Trimmed ({result.trimmed.strategyApplied})</div>
            <div>{result.trimmed.inputTokens} tokens · ${result.trimmed.costUsd.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Token savings (measured)</div>
            <div><Pct value={result.savingsPct} /></div>
          </div>
        </div>
        {result.untrimmed.costUsd === 0 && (
          <p className="text-xs text-muted-foreground">
            mock-small is a $0/MTok model, so dollar cost is honestly $0 regardless of token
            count - the token-count reduction above is the real, meaningful measurement here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** M9 Cost Lab: all 4 CLAUDE.md-mandated cost levers, each with a real measured before/after. */
export function CostLab(): JSX.Element {
  return (
    <Tabs defaultValue="cache" className="space-y-3">
      <TabsList>
        <TabsTrigger value="cache">Caching</TabsTrigger>
        <TabsTrigger value="routing">Model routing</TabsTrigger>
        <TabsTrigger value="batching">Batching</TabsTrigger>
        <TabsTrigger value="trimming">Context trimming</TabsTrigger>
      </TabsList>
      <TabsContent value="cache"><CacheLever /></TabsContent>
      <TabsContent value="routing"><RoutingLever /></TabsContent>
      <TabsContent value="batching"><BatchingLever /></TabsContent>
      <TabsContent value="trimming"><TrimmingLever /></TabsContent>
    </Tabs>
  );
}
