import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, GitCompare } from "lucide-react";
import type { Run } from "@ail/shared";
import { api, queryKeys } from "@/lib/api";
import { Badge, Button, ScrollArea, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { PricingDisclosure } from "@/components/PricingDisclosure";
import { useRunsStore } from "@/stores/runs";
import { cn } from "@/lib/utils";

export interface RunInspectorProps {
  /** Fetches the run via `GET /api/runs/:id` if `run` isn't supplied directly. */
  runId?: string;
  /** Pass the full `Run` directly (e.g. straight off an SSE `run_complete` event) to skip the fetch. */
  run?: Run;
  className?: string;
}

function CopyButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Pre({ children }: { children: string }): JSX.Element {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
      <code>{children}</code>
    </pre>
  );
}

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * Renders a persisted `Run`: request / response / params / usage+cost /
 * latency (TTFT, tok/s) / logprobs / raw JSON tabs, each with copy-to-clipboard.
 * Composes into `<ModuleShell>`'s right pane; module agents pass `runId` (or
 * `run` directly after a stream completes) - never reimplement this view.
 */
export function RunInspector({ runId, run: runProp, className }: RunInspectorProps): JSX.Element {
  const enabled = !runProp && !!runId;
  const query = useQuery({
    queryKey: queryKeys.run(runId ?? "none"),
    queryFn: () => api.run(runId as string),
    enabled,
  });

  const setCompareSlot = useRunsStore((s) => s.setCompareSlot);

  const run = runProp ?? query.data;

  if (!runProp && !runId) {
    return (
      <EmptyState
        title="No run selected"
        description="Run the playground to see request, response, cost, latency, and logprobs here."
        className={className}
      />
    );
  }

  if (enabled && query.isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (enabled && query.isError) {
    return <ErrorState message={(query.error as Error).message} className={className} />;
  }

  if (!run) {
    return <EmptyState title="Run not found" className={className} />;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={run.status === "error" ? "destructive" : run.status === "complete" ? "success" : "secondary"}>
            {run.status}
          </Badge>
          <span className="truncate text-sm text-muted-foreground">{run.model}</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setCompareSlot("a", run.id)}>
            <GitCompare className="mr-1 h-3.5 w-3.5" aria-hidden="true" />A
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCompareSlot("b", run.id)}>
            <GitCompare className="mr-1 h-3.5 w-3.5" aria-hidden="true" />B
          </Button>
        </div>
      </div>

      <Tabs defaultValue="response">
        <ScrollArea className="w-full">
          <TabsList>
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="params">Params</TabsTrigger>
            <TabsTrigger value="usage">Usage &amp; Cost</TabsTrigger>
            <TabsTrigger value="latency">Latency</TabsTrigger>
            <TabsTrigger value="logprobs">Logprobs</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="request" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton value={JSON.stringify(run.input, null, 2)} label="request" />
          </div>
          <Pre>{JSON.stringify(run.input, null, 2)}</Pre>
        </TabsContent>

        <TabsContent value="response" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton value={run.output.text} label="response text" />
          </div>
          {run.status === "error" ? (
            <ErrorState message={run.error ?? "This run failed."} />
          ) : run.output.text ? (
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{run.output.text}</p>
          ) : (
            <EmptyState title="No text output" description="This run produced tool calls or structured output only." />
          )}
          {run.output.toolCalls && run.output.toolCalls.length > 0 && (
            <Pre>{JSON.stringify(run.output.toolCalls, null, 2)}</Pre>
          )}
        </TabsContent>

        <TabsContent value="params" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton value={JSON.stringify(run.params, null, 2)} label="params" />
          </div>
          {Object.entries(run.params).map(([k, v]) => (
            <KeyValueRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
          ))}
        </TabsContent>

        <TabsContent value="usage" className="space-y-1">
          <KeyValueRow label="Input tokens" value={run.usage.inputTokens.toLocaleString()} />
          <KeyValueRow label="Output tokens" value={run.usage.outputTokens.toLocaleString()} />
          <KeyValueRow label="Total tokens" value={run.usage.totalTokens.toLocaleString()} />
          {run.usage.cachedInputTokens !== undefined && (
            <KeyValueRow label="Cached input tokens" value={run.usage.cachedInputTokens.toLocaleString()} />
          )}
          <KeyValueRow label="Input cost" value={`$${run.cost.inputCostUsd.toFixed(6)}`} />
          <KeyValueRow label="Output cost" value={`$${run.cost.outputCostUsd.toFixed(6)}`} />
          <KeyValueRow label="Total cost" value={`$${run.cost.totalCostUsd.toFixed(6)}`} />
          <div className="pt-1">
            <PricingDisclosure />
          </div>
        </TabsContent>

        <TabsContent value="latency" className="space-y-1">
          <KeyValueRow label="Total latency" value={`${run.latencyMs.toFixed(0)} ms`} />
          <KeyValueRow label="Time to first token" value={run.ttftMs !== undefined ? `${run.ttftMs.toFixed(0)} ms` : "n/a"} />
          <KeyValueRow
            label="Tokens / second"
            value={run.tokensPerSecond !== undefined ? run.tokensPerSecond.toFixed(1) : "n/a"}
          />
        </TabsContent>

        <TabsContent value="logprobs" className="space-y-2">
          {!run.logprobs || run.logprobs.length === 0 ? (
            <EmptyState title="No logprobs" description="This model/run didn't return token logprobs." />
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {run.logprobs.map((lp, i) => (
                  <div key={i} className="rounded-md border border-border p-2 text-xs">
                    <div className="flex justify-between font-mono">
                      <span>{JSON.stringify(lp.token)}</span>
                      <span>{lp.logprob.toFixed(3)}</span>
                    </div>
                    {lp.topAlternatives.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 text-muted-foreground">
                        {lp.topAlternatives.map((alt, j) => (
                          <span key={j} className="rounded bg-muted px-1">
                            {JSON.stringify(alt.token)} {alt.logprob.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="raw" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton value={JSON.stringify(run, null, 2)} label="raw run JSON" />
          </div>
          <Pre>{JSON.stringify(run, null, 2)}</Pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
