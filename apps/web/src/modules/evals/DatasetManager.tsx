import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { createDataset, deleteDataset, exportDataset, importDataset, listDatasets } from "./api";

export interface DatasetManagerProps {
  selectedDatasetId: string | null;
  onSelectDataset: (id: string | null) => void;
}

const SAMPLE_JSON = `[\n  { "input": { "prompt": "What is 2+2?" }, "expected": "4", "tags": [], "metadata": {} }\n]`;

function downloadText(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** M7 dataset manager: CRUD + JSON/CSV import/export (contracts §4 M7). */
export function DatasetManager({ selectedDatasetId, onSelectDataset }: DatasetManagerProps): JSX.Element {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["eval-datasets"], queryFn: () => listDatasets({ pageSize: 50 }) });

  const [name, setName] = React.useState("my-golden-set");
  const createMutation = useMutation({
    mutationFn: () => createDataset({ name, cases: [] }),
    onSuccess: (dataset) => {
      queryClient.invalidateQueries({ queryKey: ["eval-datasets"] });
      onSelectDataset(dataset.id);
    },
  });

  const [importFormat, setImportFormat] = React.useState<"json" | "csv">("json");
  const [importContent, setImportContent] = React.useState(SAMPLE_JSON);
  const importMutation = useMutation({
    mutationFn: () => {
      if (!selectedDatasetId) throw new Error("Select a dataset first");
      return importDataset(selectedDatasetId, importFormat, importContent);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["eval-datasets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["eval-datasets"] });
      if (selectedDatasetId === id) onSelectDataset(null);
    },
  });

  const items = listQuery.data?.items ?? [];
  const selected = items.find((d) => d.id === selectedDatasetId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dataset manager</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 rounded-md border border-border p-3">
          <h4 className="text-sm font-semibold">Create a new (empty) dataset</h4>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="dataset-name">Name</Label>
              <Input id="dataset-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
          {createMutation.isError && <ErrorState message={(createMutation.error as Error).message} />}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Datasets</h4>
          {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {items.length === 0 && !listQuery.isLoading && <EmptyState title="No datasets yet" description="Create one above." />}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((d) => (
              <div
                key={d.id}
                className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm ${d.id === selectedDatasetId ? "border-primary" : "border-border"}`}
              >
                <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onSelectDataset(d.id)}>
                  {d.name}
                </button>
                <Badge variant="outline">{d.cases.length} case(s)</Badge>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={async () => downloadText(`${d.name}.json`, await exportDataset(d.id, "json"), "application/json")}>
                    Export JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => downloadText(`${d.name}.csv`, await exportDataset(d.id, "csv"), "text/csv")}>
                    Export CSV
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(d.id)} disabled={deleteMutation.isPending}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {deleteMutation.isError && <ErrorState message={(deleteMutation.error as Error).message} />}
        </div>

        {selected && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold">Import cases into &quot;{selected.name}&quot;</h4>
            <div className="flex items-center gap-2">
              <Label htmlFor="import-format">Format</Label>
              <Select value={importFormat} onValueChange={(v) => setImportFormat(v as "json" | "csv")}>
                <SelectTrigger id="import-format" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={6}
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder={importFormat === "csv" ? "id,prompt,expected,tags\nc1,Hello world,hi,smoke" : SAMPLE_JSON}
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
            {importMutation.isSuccess && (
              <p className="text-xs text-muted-foreground">Imported {importMutation.data.imported} case(s).</p>
            )}
            {importMutation.isError && <ErrorState message={(importMutation.error as Error).message} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
