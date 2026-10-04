import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus } from "lucide-react";
import type { Run } from "@ail/shared";
import { api, queryKeys } from "@/lib/api";
import { diffFields, diffWords } from "@/lib/diff";
import { Badge, Skeleton } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { PricingDisclosure } from "@/components/PricingDisclosure";
import { useRunsStore } from "@/stores/runs";
import { cn } from "@/lib/utils";

export interface CompareViewProps {
  /** A run id (fetches via `GET /api/runs/compare`) or a full `Run` object (diffed client-side, no fetch). */
  a?: string | Run;
  /** Same as `a`. If both are omitted, falls back to the global compare-selection store (set from `<RunInspector>`'s A/B buttons). */
  b?: string | Run;
  className?: string;
}

const COMPARED_FIELDS = ["model", "providerId", "latencyMs", "ttftMs", "tokensPerSecond"] as const;

function DiffWordsView({ aText, bText }: { aText: string; bText: string }): JSX.Element {
  const tokens = React.useMemo(() => diffWords(aText, bText), [aText, bText]);
  return (
    <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
      {tokens.map((t, i) => {
        if (t.op === "same") return <span key={i}>{t.text}</span>;
        if (t.op === "remove")
          return (
            <span key={i} className="rounded bg-destructive/20 text-destructive line-through">
              {t.text}
            </span>
          );
        return (
          <span key={i} className="rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            {t.text}
          </span>
        );
      })}
    </p>
  );
}

function FieldDeltaRow({ field, aValue, bValue }: { field: string; aValue: unknown; bValue: unknown }): JSX.Element {
  const changed = JSON.stringify(aValue) !== JSON.stringify(bValue);
  return (
    <div className={cn("flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0")}>
      <span className="text-muted-foreground">{field}</span>
      <span className={cn("flex items-center gap-1 font-mono", changed && "font-semibold text-primary")}>
        <span>{String(aValue)}</span>
        {changed && (
          <>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span>{String(bValue)}</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Side-by-side A/B run comparison with a real word-level diff of the output
 * text (via `lib/diff.ts`) plus param/usage/metric deltas. Backs the Run
 * Inspector's "Compare" action and the `/runs` history page.
 */
export function CompareView({ a: aProp, b: bProp, className }: CompareViewProps): JSX.Element {
  const storeA = useRunsStore((s) => s.compareA);
  const storeB = useRunsStore((s) => s.compareB);

  const a = aProp ?? storeA;
  const b = bProp ?? storeB;

  const bothIds = typeof a === "string" && typeof b === "string";
  const query = useQuery({
    queryKey: queryKeys.compareRuns(bothIds ? (a as string) : "", bothIds ? (b as string) : ""),
    queryFn: () => api.compareRuns(a as string, b as string),
    enabled: bothIds,
  });

  if (!a || !b) {
    return (
      <EmptyState
        title="Select two runs to compare"
        description='Use the "A" / "B" buttons in the Run Inspector, or pass two run ids/Run objects to <CompareView>.'
        className={className}
      />
    );
  }

  let runA: Run | undefined;
  let runB: Run | undefined;

  if (bothIds) {
    if (query.isLoading) {
      return (
        <div className={cn("space-y-2", className)}>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return <ErrorState message={(query.error as Error).message} className={className} />;
    }
    runA = query.data?.a;
    runB = query.data?.b;
  } else if (typeof a !== "string" && typeof b !== "string") {
    runA = a;
    runB = b;
  } else {
    return (
      <ErrorState
        message="Cannot compare one run-id with one full Run object. Pass two ids or two Run objects."
        className={className}
      />
    );
  }

  if (!runA || !runB) {
    return <EmptyState title="One or both runs could not be found" className={className} />;
  }

  const paramDiff = diffFields(runA.params, runB.params);
  const usageDiff = diffFields(runA.usage, runB.usage);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Badge variant="outline">A</Badge>
          <p className="truncate text-sm font-medium">{runA.model}</p>
        </div>
        <div className="space-y-1">
          <Badge variant="outline">B</Badge>
          <p className="truncate text-sm font-medium">{runB.model}</p>
        </div>
      </div>

      <section aria-label="Output diff">
        <h4 className="mb-2 text-sm font-semibold">Output diff</h4>
        <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Minus className="h-3 w-3 text-destructive" aria-hidden="true" /> only in A
          </span>
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3 text-emerald-600" aria-hidden="true" /> only in B
          </span>
        </div>
        <DiffWordsView aText={runA.output.text} bText={runB.output.text} />
      </section>

      <section aria-label="Metric deltas">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Metrics</h4>
          <PricingDisclosure />
        </div>
        {COMPARED_FIELDS.map((field) => (
          <FieldDeltaRow key={field} field={field} aValue={runA![field as keyof Run]} bValue={runB![field as keyof Run]} />
        ))}
        <FieldDeltaRow field="totalCostUsd" aValue={runA.cost.totalCostUsd} bValue={runB.cost.totalCostUsd} />
      </section>

      <section aria-label="Params diff">
        <h4 className="mb-2 text-sm font-semibold">Params</h4>
        {paramDiff.map((d) => (
          <FieldDeltaRow key={d.field} field={d.field} aValue={d.aValue} bValue={d.bValue} />
        ))}
      </section>

      <section aria-label="Usage diff">
        <h4 className="mb-2 text-sm font-semibold">Usage</h4>
        {usageDiff.map((d) => (
          <FieldDeltaRow key={d.field} field={d.field} aValue={d.aValue} bValue={d.bValue} />
        ))}
      </section>
    </div>
  );
}
