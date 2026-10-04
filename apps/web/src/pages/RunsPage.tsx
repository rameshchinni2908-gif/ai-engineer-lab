import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { RunInspector } from "@/components/RunInspector";
import { CompareView } from "@/components/CompareView";
import { useRunsStore } from "@/stores/runs";

/** Run history browser: list, inspect, and stage any two runs for `<CompareView>`. */
export default function RunsPage(): JSX.Element {
  const [page, setPage] = React.useState(0);
  const query = useQuery({
    queryKey: queryKeys.runs({ page }),
    queryFn: () => api.runs({ page, pageSize: 20 }),
  });

  const [selectedRunId, setSelectedRunId] = React.useState<string | undefined>(undefined);
  const compareA = useRunsStore((s) => s.compareA);
  const compareB = useRunsStore((s) => s.compareB);
  const setCompareSlot = useRunsStore((s) => s.setCompareSlot);
  const clearCompare = useRunsStore((s) => s.clearCompare);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Run history</h1>
        <p className="mt-1 text-muted-foreground">
          Every generation call across every module is recorded here with full params, usage, and cost.
        </p>
      </header>

      {query.isLoading && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState message={(query.error as Error).message} />}

      {query.data && query.data.items.length === 0 && (
        <EmptyState title="No runs yet" description="Use any module's Playground to generate your first run." />
      )}

      {query.data && query.data.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.moduleId}</TableCell>
                    <TableCell>{run.feature}</TableCell>
                    <TableCell className="font-mono text-xs">{run.model}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === "error" ? "destructive" : "success"}>{run.status}</Badge>
                    </TableCell>
                    <TableCell>${run.cost.totalCostUsd.toFixed(4)}</TableCell>
                    <TableCell>{run.latencyMs.toFixed(0)} ms</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedRunId(run.id)}>
                        Inspect
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCompareSlot("a", run.id)}>
                        A
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCompareSlot("b", run.id)}>
                        B
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {query.data && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} {query.data.hasMore ? "" : "(last)"}
          </span>
          <Button variant="outline" size="sm" disabled={!query.data.hasMore} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {selectedRunId && (
        <section aria-label="Selected run inspector" className="space-y-2">
          <h2 className="text-lg font-semibold">Inspecting {selectedRunId}</h2>
          <RunInspector runId={selectedRunId} />
        </section>
      )}

      {(compareA || compareB) && (
        <section aria-label="Compare runs" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Compare</h2>
            <Button variant="ghost" size="sm" onClick={clearCompare}>
              Clear selection
            </Button>
          </div>
          <CompareView />
        </section>
      )}
    </div>
  );
}
