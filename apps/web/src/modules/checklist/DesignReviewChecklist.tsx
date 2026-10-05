import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { CHECKLIST_ITEMS } from "@/content";
import type { ChecklistItem } from "@/content/types";
import {
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { checklistApi } from "./api";

const SEVERITY_VARIANT: Record<ChecklistItem["severity"], "destructive" | "warning" | "outline"> = {
  critical: "destructive",
  important: "warning",
  "nice-to-have": "outline",
};

function groupByCategory(items: ChecklistItem[]): Map<string, ChecklistItem[]> {
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

/** Pure, exported for tests: builds a Markdown export of the checklist against the given completed set. */
export function exportChecklistMarkdown(items: ChecklistItem[], completedIds: Set<string>): string {
  const grouped = groupByCategory(items);
  const lines: string[] = ["# AI Engineer Lab - Design Review Checklist", ""];
  for (const [category, categoryItems] of grouped) {
    lines.push(`## ${category}`, "");
    for (const item of categoryItems) {
      const box = completedIds.has(item.id) ? "[x]" : "[ ]";
      lines.push(`- ${box} **${item.title}** (${item.severity}) - ${item.why}`);
      lines.push(`  - Verify: ${item.howToVerify}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function downloadMarkdown(content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-engineer-lab-checklist.md";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * M11 design-review checklist: `CHECKLIST_ITEMS` (49 items, 10 categories)
 * grouped by category, filterable by severity, checkable with state
 * persisted server-side via `/checklist/progress/*`, exportable as Markdown.
 */
export function DesignReviewChecklist(): JSX.Element {
  const [severityFilter, setSeverityFilter] = React.useState<ChecklistItem["severity"] | "all">("all");
  const queryClient = useQueryClient();

  const progressQuery = useQuery({ queryKey: ["checklist", "progress"], queryFn: checklistApi.getProgress });
  const completedIds = new Set(progressQuery.data?.completedItemIds ?? []);

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      checklistApi.completeItem(itemId, completed),
    onSuccess: (progress) => queryClient.setQueryData(["checklist", "progress"], progress),
  });

  const filtered =
    severityFilter === "all" ? CHECKLIST_ITEMS : CHECKLIST_ITEMS.filter((i) => i.severity === severityFilter);
  const grouped = groupByCategory(filtered);

  if (progressQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading progress...</p>;
  if (progressQuery.isError) return <ErrorState message="Could not load checklist progress." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="severity-filter" className="text-xs font-medium">Severity</label>
          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}>
            <SelectTrigger id="severity-filter" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="important">Important</SelectItem>
              <SelectItem value="nice-to-have">Nice to have</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {completedIds.size} / {CHECKLIST_ITEMS.length} complete
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadMarkdown(exportChecklistMarkdown(CHECKLIST_ITEMS, completedIds))}
        >
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
          Export as Markdown
        </Button>
      </div>

      {[...grouped.entries()].map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold">{category}</h3>
          <ul className="space-y-2">
            {items.map((item) => {
              const done = completedIds.has(item.id);
              return (
                <li key={item.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <input
                    type="checkbox"
                    id={`chk-${item.id}`}
                    checked={done}
                    onChange={(e) => toggleMutation.mutate({ itemId: item.id, completed: e.target.checked })}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor={`chk-${item.id}`} className="flex-1 text-sm">
                    <span className="font-medium">{item.title}</span>{" "}
                    <Badge variant={SEVERITY_VARIANT[item.severity]}>{item.severity}</Badge>
                    <p className="text-muted-foreground">{item.why}</p>
                    <p className="text-xs text-muted-foreground">Verify: {item.howToVerify}</p>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
