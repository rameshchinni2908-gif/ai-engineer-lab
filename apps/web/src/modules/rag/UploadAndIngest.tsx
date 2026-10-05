import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chunk, ChunkStrategy, Document } from "@ail/shared";
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
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { useProviderModelStore } from "@/stores/provider-model";
import { ragApi, readFileForUpload } from "./api";

const STRATEGIES: { id: ChunkStrategy; label: string }[] = [
  { id: "fixed", label: "Fixed-size" },
  { id: "recursive", label: "Recursive" },
  { id: "sentence", label: "Sentence" },
  { id: "semantic", label: "Semantic" },
  { id: "markdown", label: "Markdown-aware" },
];

export interface UploadAndIngestProps {
  collection: string;
  onCollectionReady?: (collection: string) => void;
}

/** M5: upload (PDF/MD/TXT) -> parse -> chunk -> embed -> store, every stage inspectable. */
export function UploadAndIngest({ collection, onCollectionReady }: UploadAndIngestProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const qc = useQueryClient();

  const [pastedText, setPastedText] = React.useState("");
  const [pastedName, setPastedName] = React.useState("pasted-note.md");
  const [doc, setDoc] = React.useState<Document | null>(null);
  const [strategy, setStrategy] = React.useState<ChunkStrategy>("markdown");
  const [chunkSize, setChunkSize] = React.useState(40);
  const [chunkOverlap, setChunkOverlap] = React.useState(5);
  const [chunks, setChunks] = React.useState<Chunk[] | null>(null);
  const [embedded, setEmbedded] = React.useState(false);
  const [indexed, setIndexed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const docsQuery = useQuery({ queryKey: ["rag-documents"], queryFn: () => ragApi.listDocuments() });

  function resetStages() {
    setChunks(null);
    setEmbedded(false);
    setIndexed(false);
    setError(null);
  }

  async function uploadFile(file: File) {
    setError(null);
    try {
      const { mimeType, text } = await readFileForUpload(file);
      const created = await ragApi.createDocument(file.name, mimeType, text);
      setDoc(created);
      resetStages();
      qc.invalidateQueries({ queryKey: ["rag-documents"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function uploadPasted() {
    if (!pastedText.trim()) return;
    setError(null);
    try {
      const mimeType = pastedName.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain";
      const created = await ragApi.createDocument(pastedName, mimeType, pastedText);
      setDoc(created);
      resetStages();
      qc.invalidateQueries({ queryKey: ["rag-documents"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function runChunk() {
    if (!doc) return;
    setError(null);
    try {
      const { chunks: c } = await ragApi.chunkDocument(doc.id, { strategy, chunkSize, chunkOverlap });
      setChunks(c);
      setEmbedded(false);
      setIndexed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chunking failed");
    }
  }

  async function runEmbed() {
    if (!doc) return;
    setError(null);
    try {
      await ragApi.embedDocument(doc.id, providerId, model);
      setEmbedded(true);
      setIndexed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Embedding failed");
    }
  }

  async function runIndex() {
    if (!doc) return;
    setError(null);
    try {
      await ragApi.indexDocument(doc.id, collection);
      setIndexed(true);
      onCollectionReady?.(collection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Indexing failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload &amp; ingest (every stage inspectable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rag-upload-file">Upload a file (.pdf, .md, .txt)</Label>
            <Input
              id="rag-upload-file"
              type="file"
              accept=".pdf,.md,.txt,text/plain,text/markdown,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              PDF text extraction uses <code>pdf-parse</code> server-side; a corrupted/unsupported PDF degrades
              gracefully (document is still created, with a <code>parseWarning</code> instead of a crash).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rag-paste-name">...or paste text directly</Label>
            <Input id="rag-paste-name" value={pastedName} onChange={(e) => setPastedName(e.target.value)} placeholder="name.md" />
            <Textarea rows={3} value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste markdown or plain text..." />
            <Button size="sm" onClick={uploadPasted}>
              Create document from pasted text
            </Button>
          </div>
        </div>

        {(docsQuery.data?.items.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {docsQuery.data!.items.map((d) => (
              <Button key={d.id} size="sm" variant={doc?.id === d.id ? "default" : "secondary"} onClick={() => { setDoc(d); resetStages(); }}>
                {d.name}
              </Button>
            ))}
          </div>
        )}

        {!doc ? (
          <EmptyState title="No document selected" description="Upload a file or paste text above to begin the pipeline." />
        ) : (
          <div className="space-y-4 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Document: {doc.name}</h4>
              <Badge variant="outline">{doc.mimeType}</Badge>
            </div>
            {typeof doc.metadata.parseWarning === "string" && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                Parse stage warning: {doc.metadata.parseWarning}
              </p>
            )}
            <p className="text-xs text-muted-foreground line-clamp-3">{doc.text.slice(0, 300) || "(empty)"}</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="rag-chunk-strategy">
                  <GlossaryTerm id="chunking">Chunk strategy</GlossaryTerm>
                </Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as ChunkStrategy)}>
                  <SelectTrigger id="rag-chunk-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rag-chunk-size">Chunk size (tokens)</Label>
                <Input id="rag-chunk-size" type="number" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="rag-chunk-overlap">Overlap (tokens)</Label>
                <Input id="rag-chunk-overlap" type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(Number(e.target.value))} />
              </div>
            </div>
            <Button size="sm" onClick={runChunk}>
              1. Chunk
            </Button>

            {chunks && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{chunks.length} chunk(s) produced.</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                  {chunks.slice(0, 5).map((c) => (
                    <li key={c.id} className="truncate border-t border-border pt-1">
                      [{c.index}] ({c.tokenCount} tok) {c.text}
                    </li>
                  ))}
                </ul>

                <ProviderModelSelector
                  providerId={providerId}
                  model={model}
                  onChange={(next) => {
                    setProviderId(next.providerId);
                    setModel(next.model);
                  }}
                />
                <Button size="sm" onClick={runEmbed} disabled={embedded}>
                  2. Embed {embedded && "✓"}
                </Button>
              </div>
            )}

            {embedded && (
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="rag-index-collection">Collection to index into</Label>
                  <Input id="rag-index-collection" value={collection} readOnly className="font-mono" />
                </div>
                <Button size="sm" onClick={runIndex} disabled={indexed}>
                  3. Index {indexed && "✓"}
                </Button>
              </div>
            )}

            {indexed && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Indexed into &quot;{collection}&quot; - ready to query in the Playground tab.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
