import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { useProviderModelStore } from "@/stores/provider-model";
import { embeddingsApi } from "./api";

const EMBED_DIM = 64; // MockProvider's deterministic embedding dimension.

/** M4: vector playground - create/list/delete collections, upsert, metadata-filtered search, delete points, count. */
export function VectorPlayground(): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const qc = useQueryClient();

  const collectionsQuery = useQuery({
    queryKey: ["vector-playground-collections"],
    queryFn: () => embeddingsApi.listCollections(),
  });

  const [newName, setNewName] = React.useState("demo-collection");
  const [distance, setDistance] = React.useState<"cosine" | "dot" | "euclidean">("cosine");
  const [activeCollection, setActiveCollection] = React.useState<string | undefined>();
  const [upsertRaw, setUpsertRaw] = React.useState("p1 | the quick brown fox | {\"category\":\"animal\"}\np2 | a fast red car | {\"category\":\"vehicle\"}");
  const [searchQuery, setSearchQuery] = React.useState("a speedy animal");
  const [searchFilter, setSearchFilter] = React.useState("");
  const [topK, setTopK] = React.useState(5);
  const [deleteIds, setDeleteIds] = React.useState("");
  const [log, setLog] = React.useState<string[]>([]);
  const [searchHits, setSearchHits] = React.useState<{ id: string; score: number; metadata: Record<string, unknown> }[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const countQuery = useQuery({
    queryKey: ["vector-playground-count", activeCollection],
    queryFn: () => embeddingsApi.count(activeCollection!),
    enabled: Boolean(activeCollection),
  });

  const appendLog = (msg: string) => setLog((prev) => [msg, ...prev].slice(0, 8));
  const refreshCollections = () => qc.invalidateQueries({ queryKey: ["vector-playground-collections"] });

  async function createCollection() {
    setError(null);
    try {
      await embeddingsApi.createCollection(newName, EMBED_DIM, { distance });
      appendLog(`Created collection "${newName}" (dim=${EMBED_DIM}, distance=${distance})`);
      setActiveCollection(newName);
      refreshCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function deleteCollection(name: string) {
    await embeddingsApi.deleteCollection(name);
    appendLog(`Deleted collection "${name}"`);
    if (activeCollection === name) setActiveCollection(undefined);
    refreshCollections();
  }

  async function upsert() {
    if (!activeCollection) return;
    setError(null);
    try {
      const lines = upsertRaw.split("\n").map((l) => l.trim()).filter(Boolean);
      const parsed = lines.map((line) => {
        const [id, text, metaRaw] = line.split("|").map((p) => p.trim());
        return { id: id!, text: text ?? "", metadata: metaRaw ? (JSON.parse(metaRaw) as Record<string, unknown>) : {} };
      });
      const { embeddings } = await embeddingsApi.embed(parsed.map((p) => p.text), providerId, model);
      await embeddingsApi.upsert(
        activeCollection,
        parsed.map((p, i) => ({ id: p.id, vector: embeddings[i]!, metadata: { ...p.metadata, text: p.text } })),
      );
      appendLog(`Upserted ${parsed.length} point(s) into "${activeCollection}"`);
      qc.invalidateQueries({ queryKey: ["vector-playground-count", activeCollection] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upsert failed (check your `id | text | {json metadata}` format)");
    }
  }

  async function search() {
    if (!activeCollection) return;
    setError(null);
    try {
      const { embeddings } = await embeddingsApi.embed([searchQuery], providerId, model);
      const filter = searchFilter.trim() ? (JSON.parse(searchFilter) as Record<string, unknown>) : undefined;
      const { hits } = await embeddingsApi.search(activeCollection, embeddings[0]!, { topK, filter });
      setSearchHits(hits);
      appendLog(`Search returned ${hits.length} hit(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed (check filter JSON)");
    }
  }

  async function deletePoints() {
    if (!activeCollection) return;
    const ids = deleteIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    const { deleted } = await embeddingsApi.deletePoints(activeCollection, ids);
    appendLog(`Deleted ${deleted} point(s) from "${activeCollection}"`);
    qc.invalidateQueries({ queryKey: ["vector-playground-count", activeCollection] });
  }

  const collections = collectionsQuery.data?.collections ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vector playground</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProviderModelSelector
          providerId={providerId}
          model={model}
          onChange={(next) => {
            setProviderId(next.providerId);
            setModel(next.model);
          }}
        />
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="vp-new-name">New collection name</Label>
            <Input id="vp-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="vp-distance">Distance metric</Label>
            <Select value={distance} onValueChange={(v) => setDistance(v as typeof distance)}>
              <SelectTrigger id="vp-distance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cosine">cosine</SelectItem>
                <SelectItem value="dot">dot</SelectItem>
                <SelectItem value="euclidean">euclidean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={createCollection}>Create collection</Button>
          </div>
        </div>

        {collections.length === 0 ? (
          <EmptyState title="No collections yet" description="Create one above to get started." />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {collections.map((c) => (
              <div key={c} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={activeCollection === c ? "default" : "secondary"}
                  onClick={() => setActiveCollection(c)}
                >
                  {c}
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete collection ${c}`} onClick={() => deleteCollection(c)}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}

        {activeCollection && (
          <div className="space-y-4 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Active: {activeCollection}</h4>
              <Badge variant="outline">count: {countQuery.data?.count ?? "..."}</Badge>
            </div>

            <div>
              <Label htmlFor="vp-upsert">Upsert points (one per line: `id | text | {`{json metadata}`}`)</Label>
              <Textarea id="vp-upsert" rows={3} value={upsertRaw} onChange={(e) => setUpsertRaw(e.target.value)} />
              <Button size="sm" className="mt-2" onClick={upsert}>
                Upsert
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label htmlFor="vp-search-query">Search query text</Label>
                <Input id="vp-search-query" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="vp-search-filter">Metadata filter (JSON)</Label>
                <Input id="vp-search-filter" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder='{"category":"animal"}' />
              </div>
              <div>
                <Label htmlFor="vp-topk">topK</Label>
                <Input id="vp-topk" type="number" min={1} value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
              </div>
            </div>
            <Button size="sm" onClick={search}>
              Search
            </Button>
            {searchHits.length > 0 && (
              <ul className="space-y-1 text-xs">
                {searchHits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 border-t border-border pt-1">
                    <span className="truncate">
                      {h.id}: {String(h.metadata.text ?? "")}
                    </span>
                    <Badge variant="outline">{h.score.toFixed(3)}</Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="vp-delete-ids">Delete point ids (comma-separated)</Label>
                <Input id="vp-delete-ids" value={deleteIds} onChange={(e) => setDeleteIds(e.target.value)} />
              </div>
              <Button size="sm" variant="destructive" onClick={deletePoints}>
                Delete points
              </Button>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
