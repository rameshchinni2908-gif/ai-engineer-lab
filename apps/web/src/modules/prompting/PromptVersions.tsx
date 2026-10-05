import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui";
import { StreamingRegion } from "@/components/StreamingRegion";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { diffWords } from "@/lib/diff";
import { useSse } from "@/hooks/useSse";
import { useProviderModelStore } from "@/stores/provider-model";
import { createPromptVersion, listPromptVersions, renderTemplate, updatePromptVersion } from "./api";

export interface PromptVersionsProps {
  onRunComplete?: (runId: string) => void;
}

/** M2 prompt versioning: append-only CRUD, version diff, and run-a-version. */
export function PromptVersions({ onRunComplete }: PromptVersionsProps): JSX.Element {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["prompt-versions"], queryFn: () => listPromptVersions() });

  const [name, setName] = React.useState("support-reply");
  const [template, setTemplate] = React.useState("Reply to this customer message professionally: {{message}}");
  const [variables, setVariables] = React.useState("message");

  const createMutation = useMutation({
    mutationFn: () =>
      createPromptVersion({
        name,
        template,
        variables: variables.split(",").map((v) => v.trim()).filter(Boolean),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
  });

  const [editId, setEditId] = React.useState<string | null>(null);
  const [editTemplate, setEditTemplate] = React.useState("");
  const editMutation = useMutation({
    mutationFn: (id: string) => updatePromptVersion(id, { template: editTemplate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-versions"] });
      setEditId(null);
    },
  });

  const [diffA, setDiffA] = React.useState<string | null>(null);
  const [diffB, setDiffB] = React.useState<string | null>(null);

  const [runVersionId, setRunVersionId] = React.useState<string | null>(null);
  const [runVarValues, setRunVarValues] = React.useState<Record<string, string>>({});
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [renderedForRun, setRenderedForRun] = React.useState<string | null>(null);
  const runSse = useSse(
    "/api/prompting/technique-demo",
    { technique: "zero-shot", input: renderedForRun ?? "", providerId: storeProviderId, model: storeModel },
    { autoStart: false },
  );

  const notifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const [id, r] of Object.entries(runSse.runs)) {
      if (r.status === "complete" && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        onRunComplete?.(id);
      }
    }
  }, [runSse.runs, onRunComplete]);

  const items = listQuery.data?.items ?? [];
  const versionA = items.find((v) => v.id === diffA);
  const versionB = items.find((v) => v.id === diffB);
  const diffTokens = versionA && versionB ? diffWords(versionA.template, versionB.template) : null;
  const runVersion = items.find((v) => v.id === runVersionId);

  async function startRunVersion(): Promise<void> {
    if (!runVersion) return;
    const { renderedPrompt } = await renderTemplate(runVersion.template, runVarValues);
    setRenderedForRun(renderedPrompt);
  }

  React.useEffect(() => {
    if (renderedForRun !== null) runSse.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once when renderedForRun is freshly set
  }, [renderedForRun]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt versioning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 rounded-md border border-border p-3">
          <h4 className="text-sm font-semibold">Create a new prompt version</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pv-name">Name</Label>
              <Input id="pv-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pv-vars">Variables (comma-separated)</Label>
              <Input id="pv-vars" value={variables} onChange={(e) => setVariables(e.target.value)} />
            </div>
          </div>
          <Label htmlFor="pv-template">Template</Label>
          <Textarea id="pv-template" rows={2} value={template} onChange={(e) => setTemplate(e.target.value)} />
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save version 1"}
          </Button>
          {createMutation.isError && <ErrorState message={(createMutation.error as Error).message} />}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Version history</h4>
          {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {items.length === 0 && !listQuery.isLoading && <EmptyState title="No prompt versions yet" />}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {items.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                <Badge variant="outline">{v.name}</Badge>
                <Badge variant="secondary">v{v.version}</Badge>
                <span className="max-w-xs truncate font-mono text-xs text-muted-foreground">{v.template}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setDiffA(v.id)}>
                    A
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDiffB(v.id)}>
                    B
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditId(v.id);
                      setEditTemplate(v.template);
                    }}
                  >
                    Edit (new version)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setRunVersionId(v.id);
                      setRunVarValues(Object.fromEntries(v.variables.map((name2) => [name2, ""])));
                      setRenderedForRun(null);
                    }}
                  >
                    Run this version
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {editId && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold">Edit (creates a NEW version, history is append-only)</h4>
            <Textarea rows={2} value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => editMutation.mutate(editId)} disabled={editMutation.isPending}>
                Save as new version
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {diffTokens && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">
              Diff: {versionA!.name} v{versionA!.version} &rarr; v{versionB!.version}
            </h4>
            <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm">
              {diffTokens.map((t, i) => {
                if (t.op === "same") return <span key={i}>{t.text}</span>;
                if (t.op === "remove")
                  return (
                    <span key={i} className="bg-red-200 line-through dark:bg-red-900/60">
                      {t.text}
                    </span>
                  );
                return (
                  <span key={i} className="bg-emerald-200 dark:bg-emerald-900/60">
                    {t.text}
                  </span>
                );
              })}
            </p>
          </div>
        )}

        {runVersion && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold">
              Run {runVersion.name} v{runVersion.version}
            </h4>
            {runVersion.variables.map((v) => (
              <div key={v}>
                <Label htmlFor={`run-var-${v}`}>{v}</Label>
                <Input
                  id={`run-var-${v}`}
                  value={runVarValues[v] ?? ""}
                  onChange={(e) => setRunVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                />
              </div>
            ))}
            <Button size="sm" onClick={startRunVersion}>
              Render + run
            </Button>
            {Object.entries(runSse.runs).map(([id, r]) => (
              <StreamingRegion
                key={id}
                text={r.tokens.join("")}
                status={r.status === "pending" ? "idle" : r.status}
                tokenCount={r.run?.usage.outputTokens}
                label="Prompt version run"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
