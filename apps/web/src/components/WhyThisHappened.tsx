import { useQuery } from "@tanstack/react-query";
import { Lightbulb, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { ExplainFactor, ExplainRunResponse } from "@ail/shared";
import { api, ApiClientError } from "@/lib/api";
import { useDifficulty } from "@/hooks/useDifficulty";
import { Skeleton } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export interface WhyThisHappenedProps {
  /** Fetches `POST /api/explain-run` (re-fetches when the difficulty toggle changes). */
  runId?: string;
  /** Pass a pre-fetched `ExplainRunResponse` directly to skip the request. */
  explain?: ExplainRunResponse;
  className?: string;
}

const impactIcon: Record<ExplainFactor["impact"], JSX.Element> = {
  increased: <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
  decreased: <TrendingDown className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />,
  neutral: <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />,
};

const impactLabel: Record<ExplainFactor["impact"], string> = {
  increased: "increased",
  decreased: "decreased",
  neutral: "no clear effect",
};

/**
 * Renders `explainRun()`'s output: a summary tied to the ACTUAL run plus
 * `factors` (each annotated increased/decreased/neutral) and concrete
 * `whatToTryNext` suggestions. Depth-aware via `useDifficulty()` - prefers
 * `variants[difficulty]` when the backend supplies per-depth wording.
 *
 * Per CLAUDE.md this must never show generic boilerplate; if `explainRun()`
 * itself returns generic text, that's a backend-core/explain-service bug,
 * not something this component can paper over.
 */
export function WhyThisHappened({ runId, explain: explainProp, className }: WhyThisHappenedProps): JSX.Element {
  const { difficulty } = useDifficulty();

  const enabled = !explainProp && !!runId;
  const query = useQuery({
    queryKey: ["explain-run", runId, difficulty],
    queryFn: () => api.explainRun({ runId: runId as string, difficulty }),
    enabled,
    retry: false,
  });

  if (!runId && !explainProp) {
    return (
      <EmptyState
        title="Nothing to explain yet"
        description='Run the playground, then this panel will explain WHY that specific run behaved the way it did.'
        className={className}
      />
    );
  }

  if (enabled && query.isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (enabled && query.isError) {
    const err = query.error;
    const message =
      err instanceof ApiClientError && err.code === "CONFLICT"
        ? "This run hasn't finished yet - explanations are available once it completes."
        : err instanceof Error
          ? err.message
          : "Could not generate an explanation for this run.";
    return <ErrorState message={message} className={className} />;
  }

  const explain = explainProp ?? query.data;
  if (!explain) {
    return <EmptyState title="No explanation available" className={className} />;
  }

  const summary = explain.variants?.[difficulty] ?? explain.summary;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="text-sm">{summary}</p>
      </div>

      {explain.factors.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Why this happened</h4>
          <ul className="space-y-2">
            {explain.factors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
                {impactIcon[factor.impact]}
                <div>
                  <span className="font-medium font-mono tabular-nums">
                    {factor.label}: {factor.value}
                  </span>{" "}
                  <span className="text-muted-foreground">({impactLabel[factor.impact]})</span>
                  <p className="text-muted-foreground">{factor.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {explain.whatToTryNext.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">What to try next</h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {explain.whatToTryNext.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
