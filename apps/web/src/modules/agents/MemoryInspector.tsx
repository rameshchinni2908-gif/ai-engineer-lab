import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { getAgentMemory } from "./api";

export interface MemoryInspectorProps {
  agentRunId?: string;
  /** Refetch while the run is still going, so writes show up live. */
  isRunning: boolean;
}

/**
 * Deliverable #3: all three memory types (short-term, long-term/vector,
 * summary), each inspectable - what was written, retrieved, and why, per
 * step. Backed by `GET /api/agents/:id/memory`.
 */
export function MemoryInspector({ agentRunId, isRunning }: MemoryInspectorProps): JSX.Element {
  const query = useQuery({
    queryKey: ["agent-memory", agentRunId],
    queryFn: () => getAgentMemory(agentRunId!),
    enabled: Boolean(agentRunId),
    refetchInterval: isRunning ? 1000 : false,
  });

  if (!agentRunId) {
    return <EmptyState title="No memory yet" description="Run the agent to inspect its short-term, long-term, and summary memory." />;
  }
  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Failed to load memory."} onRetry={() => query.refetch()} />;
  }
  const memory = query.data!;

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="font-semibold">
          <GlossaryTerm id="short-term-memory">Short-term memory</GlossaryTerm> ({memory.shortTerm.length} entries)
        </h4>
        <p className="text-xs text-muted-foreground">The in-context scratchpad for this run - every step's content, in order.</p>
        <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
          {memory.shortTerm.map((entry, i) => (
            <li key={i} className="rounded border border-border p-1.5">
              {JSON.stringify(entry)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="font-semibold">
          <GlossaryTerm id="long-term-memory">Long-term (vector) memory</GlossaryTerm> ({memory.longTerm.length} entries)
        </h4>
        <p className="text-xs text-muted-foreground">
          Conclusions persisted across steps, embedded for similarity search. Empty if this runtime never writes to it.
        </p>
        {memory.longTerm.length === 0 ? (
          <EmptyState title="Nothing written yet" className="py-4" />
        ) : (
          <ul className="mt-1 space-y-1">
            {memory.longTerm.map((hit) => (
              <li key={hit.id} className="rounded border border-border p-1.5">
                <Badge variant="outline">score {hit.score.toFixed(2)}</Badge>{" "}
                {String((hit.metadata as { text?: unknown }).text ?? "")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {memory.retrievals.length > 0 && (
        <section>
          <h4 className="font-semibold">What was retrieved, and why</h4>
          <ul className="mt-1 space-y-1">
            {memory.retrievals.map((r, i) => (
              <li key={i} className="rounded border border-border p-1.5">
                Step {r.stepIndex} queried long-term memory for &quot;{r.query}&quot; -&gt; {r.hits.length} hit(s)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="font-semibold">Summary memory (rolling compaction)</h4>
        {memory.summary.length === 0 ? (
          <EmptyState title="No summary yet" className="py-4" />
        ) : (
          <p className="rounded border border-border p-1.5 text-muted-foreground">{memory.summary}</p>
        )}
      </section>
    </div>
  );
}
