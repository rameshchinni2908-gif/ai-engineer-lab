import type { Chunk, ChunkConfig, Document, Paginated, ProviderId, Run, RetrievalDebug } from "@ail/shared";
import { apiFetch } from "@/lib/api";

export type RagStrategy = "basic" | "query-rewrite" | "hyde" | "multi-query" | "parent-doc" | "compression" | "agentic";
export type FailureMode = "miss" | "ignored" | "lost-in-middle" | "stale";

/** Typed fetchers for every M5 (`/rag`) route - contracts.md §4. */
export const ragApi = {
  createDocument: (name: string, mimeType: string, text: string): Promise<Document> =>
    apiFetch("/rag/documents", { method: "POST", body: { name, mimeType, text } }),

  listDocuments: (page = 0, pageSize = 20): Promise<Paginated<Document>> =>
    apiFetch("/rag/documents", { query: { page, pageSize } }),

  getDocument: (id: string): Promise<Document> => apiFetch(`/rag/documents/${id}`),

  deleteDocument: (id: string): Promise<{ ok: true }> => apiFetch(`/rag/documents/${id}`, { method: "DELETE" }),

  chunkDocument: (id: string, config: ChunkConfig): Promise<{ chunks: Chunk[] }> =>
    apiFetch(`/rag/documents/${id}/chunk`, { method: "POST", body: { config } }),

  embedDocument: (id: string, providerId: ProviderId, model: string): Promise<{ chunks: Chunk[] }> =>
    apiFetch(`/rag/documents/${id}/embed`, { method: "POST", body: { providerId, model } }),

  indexDocument: (id: string, collection: string): Promise<{ ok: true; count: number }> =>
    apiFetch(`/rag/documents/${id}/index`, { method: "POST", body: { collection } }),

  failureModeDemo: (
    mode: FailureMode,
    query: string,
    collection: string,
  ): Promise<{ diagnosis: string; fix: string; retrievalDebug: RetrievalDebug; run: Run }> =>
    apiFetch("/rag/failure-mode-demo", { method: "POST", body: { mode, query, collection } }),
};

/** Reads a browser `File` as UTF-8 text (md/txt) or base64 (pdf), matching `routes/rag/index.ts`'s JSON ingestion convention. */
export function readFileForUpload(file: File): Promise<{ mimeType: string; text: string }> {
  return new Promise((resolve, reject) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    if (isPdf) {
      reader.onload = () => {
        const result = reader.result as string; // "data:application/pdf;base64,AAAA..."
        const base64 = result.slice(result.indexOf(",") + 1);
        resolve({ mimeType: "application/pdf", text: base64 });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => resolve({ mimeType: file.type || "text/plain", text: String(reader.result) });
      reader.readAsText(file);
    }
  });
}
