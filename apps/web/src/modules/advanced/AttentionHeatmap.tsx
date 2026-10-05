import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Textarea, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { advancedApi } from "./api";

function cellColor(weight: number): string {
  // weight is already row-normalized (0..~1); map to an opacity so the
  // "illustrative" heuristic is visually obvious as a heatmap, not real data.
  const alpha = Math.min(1, weight * 2.2);
  return `rgba(99, 102, 241, ${alpha.toFixed(2)})`;
}

/**
 * M10 interactive attention heatmap. ALWAYS labeled illustrative/simulated
 * per contracts.md §4 M10 - the backend's `note` field is rendered verbatim,
 * and this component adds its own banner too so the disclosure can never be
 * accidentally dropped by a future edit to just one of the two places.
 */
export function AttentionHeatmap(): JSX.Element {
  const [text, setText] = React.useState("The quick brown fox jumps over the lazy dog");
  const [hover, setHover] = React.useState<{ i: number; j: number } | null>(null);

  const mutation = useMutation({
    mutationFn: () => advancedApi.attentionHeatmap({ text, providerId: "mock", model: "mock-large" }),
  });

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
        Simulated, for intuition only - no provider (including mock) exposes real attention
        weights. This heuristic combines token-text similarity and positional distance; it is
        never the model&apos;s actual internal computation.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label="Text to visualize illustrative attention for"
      />
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || text.trim().length === 0}>
        {mutation.isPending ? "Computing..." : "Compute illustrative heatmap"}
      </Button>
      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hover a cell to inspect (row attends to column)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th aria-hidden="true" />
                    {mutation.data.tokens.map((t, j) => (
                      <th key={j} className="max-w-8 truncate px-1 font-normal text-muted-foreground">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mutation.data.attention.map((row, i) => (
                    <tr key={i}>
                      <th className="max-w-8 truncate px-1 text-right font-normal text-muted-foreground">
                        {mutation.data!.tokens[i]}
                      </th>
                      {row.map((w, j) => (
                        <td
                          key={j}
                          role="gridcell"
                          tabIndex={0}
                          onFocus={() => setHover({ i, j })}
                          onMouseEnter={() => setHover({ i, j })}
                          onMouseLeave={() => setHover(null)}
                          style={{ backgroundColor: cellColor(w) }}
                          className="h-5 w-5 border border-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={`${mutation.data!.tokens[i]} attends to ${mutation.data!.tokens[j]}: ${w.toFixed(3)}`}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {hover
                ? `"${mutation.data.tokens[hover.i]}" -> "${mutation.data.tokens[hover.j]}": ${mutation.data.attention[hover.i]![hover.j]!.toFixed(3)}`
                : "Hover or focus a cell for its exact illustrative weight."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{mutation.data.note}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
