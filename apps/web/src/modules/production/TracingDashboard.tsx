import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { Span } from "@ail/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
} from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { RunInspector } from "@/components/RunInspector";
import { api } from "@/lib/api";
import { productionApi, type CostSummaryGroupBy } from "./api";

/** Builds a parent->children adjacency so the waterfall can render depth-indented rows. */
function buildDepthOrder(spans: Span[]): { span: Span; depth: number }[] {
  const byParent = new Map<string | undefined, Span[]>();
  for (const s of spans) {
    const list = byParent.get(s.parentSpanId) ?? [];
    list.push(s);
    byParent.set(s.parentSpanId, list);
  }
  const ordered: { span: Span; depth: number }[] = [];
  function visit(parentId: string | undefined, depth: number): void {
    const children = byParent.get(parentId) ?? [];
    for (const child of children.sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      ordered.push({ span: child, depth });
      visit(child.spanId, depth + 1);
    }
  }
  visit(undefined, 0);
  // Any spans whose parentSpanId didn't match anything in this trace (shouldn't
  // happen, but defend against it) still get shown rather than silently dropped.
  const seen = new Set(ordered.map((o) => o.span.spanId));
  for (const s of spans) if (!seen.has(s.spanId)) ordered.push({ span: s, depth: 0 });
  return ordered;
}

/** Cost/tokens/latency per feature, aggregated from the real `runs` table. */
function CostSummaryTable(): JSX.Element {
  const [groupBy, setGroupBy] = React.useState<CostSummaryGroupBy>("feature");
  const query = useQuery({
    queryKey: ["production", "cost-summary", groupBy],
    queryFn: () => productionApi.costSummary({ groupBy }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Cost / tokens / latency, aggregated from real runs</CardTitle>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as CostSummaryGroupBy)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="feature">By feature</SelectItem>
            <SelectItem value="module">By module</SelectItem>
            <SelectItem value="model">By model</SelectItem>
            <SelectItem value="providerId">By provider</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {query.isError && <ErrorState message="Could not load cost summary." />}
        {query.data && query.data.rows.length === 0 && (
          <EmptyState title="No runs recorded yet" description="Run anything in any module first - every generation records a Run." />
        )}
        {query.data && query.data.rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupBy}</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Total cost</TableHead>
                <TableHead>Total tokens</TableHead>
                <TableHead>Avg latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.key}</TableCell>
                  <TableCell>{row.runCount}</TableCell>
                  <TableCell>${row.totalCostUsd.toFixed(4)}</TableCell>
                  <TableCell>{row.totalTokens}</TableCell>
                  <TableCell>{row.avgLatencyMs.toFixed(0)}ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_COLOR: Record<Span["kind"], string> = {
  llm_call: "bg-primary",
  tool_call: "bg-amber-500",
  retrieval: "bg-sky-500",
  embedding: "bg-violet-500",
  guardrail: "bg-destructive",
  agent_step: "bg-emerald-500",
  internal: "bg-muted-foreground",
};

/** A real OTel-shaped span waterfall for one trace, with drill-down into the originating Run. */
function SpanWaterfall(): JSX.Element {
  const tracesQuery = useQuery({ queryKey: ["traces", "list"], queryFn: () => api.traces({ pageSize: 20 }) });
  const [traceId, setTraceId] = React.useState<string>();
  const [selectedSpanRunId, setSelectedSpanRunId] = React.useState<string>();

  const activeTraceId = traceId ?? tracesQuery.data?.items[0]?.id;
  const traceQuery = useQuery({
    queryKey: ["traces", "detail", activeTraceId],
    queryFn: () => api.trace(activeTraceId as string),
    enabled: !!activeTraceId,
  });

  if (tracesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading traces...</p>;
  if (tracesQuery.isError) return <ErrorState message="Could not load traces." />;
  if (tracesQuery.data && tracesQuery.data.items.length === 0) {
    return (
      <EmptyState
        title="No traces recorded yet"
        description="Multi-stage operations (RAG queries, agent runs, evals, the latency lab) record real OTel-style spans - run one, then come back here."
      />
    );
  }

  const trace = traceQuery.data;
  const ordered = trace ? buildDepthOrder(trace.spans) : [];
  const maxDuration = Math.max(1, ...ordered.map((o) => o.span.durationMs ?? 0));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Span waterfall (real recorded spans)</CardTitle>
        <Select value={activeTraceId} onValueChange={setTraceId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {tracesQuery.data!.items.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.id} · {t.totals.durationMs}ms · ${t.totals.cost.totalCostUsd.toFixed(4)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {traceQuery.isLoading && <p className="text-sm text-muted-foreground">Loading trace...</p>}
        {trace && (
          <>
            <div className="space-y-1">
              {ordered.map(({ span, depth }) => {
                const runId = typeof span.attributes.runId === "string" ? span.attributes.runId : undefined;
                const width = Math.max(2, ((span.durationMs ?? 0) / maxDuration) * 100);
                return (
                  <div key={span.spanId} className="flex items-center gap-2 text-xs">
                    <span className="w-48 shrink-0 truncate" style={{ paddingLeft: depth * 12 }}>
                      {span.name}
                    </span>
                    <span className={`h-3 rounded-sm ${KIND_COLOR[span.kind]}`} style={{ width: `${width}%` }} />
                    <span className="w-16 shrink-0 text-muted-foreground">{span.durationMs ?? 0}ms</span>
                    <Badge variant={span.status === "error" ? "destructive" : "outline"}>{span.kind}</Badge>
                    {runId && (
                      <button
                        type="button"
                        className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSelectedSpanRunId(runId)}
                      >
                        view run
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              Totals: {trace.totals.durationMs}ms · ${trace.totals.cost.totalCostUsd.toFixed(4)} ·{" "}
              {trace.totals.usage.totalTokens} tokens
            </div>
          </>
        )}
        {selectedSpanRunId && (
          <div>
            <h4 className="mb-1 text-sm font-semibold">Drilled-into run</h4>
            <RunInspector runId={selectedSpanRunId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** M9 Tracing Dashboard: cost/tokens/latency per feature + a real span waterfall with Run drill-down. */
export function TracingDashboard(): JSX.Element {
  return (
    <div className="space-y-4">
      <CostSummaryTable />
      <SpanWaterfall />
    </div>
  );
}
