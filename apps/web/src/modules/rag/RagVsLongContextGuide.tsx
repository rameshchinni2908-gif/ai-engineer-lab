import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { ragApi } from "./api";

const CHARS_PER_TOKEN_ESTIMATE = 4; // rough, clearly-labeled approximation, consistent with the rest of the app's illustrative-figure disclosures.

/**
 * RAG vs long-context vs fine-tune decision framing, driven by the user's
 * OWN measured numbers where possible: real recent `rag`/`query` `Run`s
 * (actual input tokens/cost) compared against an estimate of what stuffing
 * the entire indexed corpus into context would have cost instead.
 */
export function RagVsLongContextGuide(): JSX.Element {
  const runsQuery = useQuery({
    queryKey: ["rag-vs-long-context-runs"],
    queryFn: () => api.runs({ moduleId: "rag", feature: "query", pageSize: 10 }),
  });
  const docsQuery = useQuery({ queryKey: ["rag-vs-long-context-docs"], queryFn: () => ragApi.listDocuments(0, 100) });

  const runs = runsQuery.data?.items ?? [];
  const avgRagInputTokens = runs.length > 0 ? runs.reduce((s, r) => s + r.usage.inputTokens, 0) / runs.length : 0;
  const avgRagCost = runs.length > 0 ? runs.reduce((s, r) => s + r.cost.totalCostUsd, 0) / runs.length : 0;

  const totalCorpusChars = (docsQuery.data?.items ?? []).reduce((s, d) => s + d.text.length, 0);
  const estimatedLongContextTokens = Math.ceil(totalCorpusChars / CHARS_PER_TOKEN_ESTIMATE);
  const sampleModel = runs[0]?.model;
  const sampleCostPerInputToken = runs[0] ? runs[0].cost.inputCostUsd / Math.max(runs[0].usage.inputTokens, 1) : 0;
  const estimatedLongContextCost = estimatedLongContextTokens * sampleCostPerInputToken;

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RAG vs long-context vs fine-tune</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No measured RAG runs yet"
            description="Run at least one query in the Playground tab - this guide computes its numbers from your own real runs, not generic figures."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RAG vs long-context vs fine-tune (your own measured numbers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th>Approach</th>
              <th>Input tokens</th>
              <th>Est. cost ({sampleModel ?? "n/a"})</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-1">RAG (measured avg over {runs.length} real run(s))</td>
              <td>{Math.round(avgRagInputTokens)}</td>
              <td>${avgRagCost.toFixed(6)}</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-1">
                Long-context (estimate: stuffing your entire {docsQuery.data?.items.length ?? 0}-document, {totalCorpusChars}
                -char corpus into one prompt)
              </td>
              <td>~{estimatedLongContextTokens}</td>
              <td>~${estimatedLongContextCost.toFixed(6)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Long-context figures are a rough {CHARS_PER_TOKEN_ESTIMATE}-chars-per-token estimate, clearly
          illustrative, not a real tokenizer count.
        </p>
        <Badge variant={estimatedLongContextTokens > avgRagInputTokens * 3 ? "success" : "outline"}>
          {estimatedLongContextTokens > avgRagInputTokens * 3
            ? "RAG is using substantially fewer tokens than stuffing the full corpus would"
            : "Your corpus is small enough that long-context may be competitive here"}
        </Badge>
        <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
          <li>RAG wins when the corpus changes often, needs per-answer citations, or is too large to fit in any context window.</li>
          <li>Long-context wins when the corpus is small/stable and you want to avoid retrieval-stage failure modes entirely.</li>
          <li>Fine-tuning wins when the task itself (not the knowledge) needs to change - a stable behavior/format/style, with enough labeled examples, where you don't need per-answer source citations.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
