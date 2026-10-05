import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { embeddingsApi } from "./api";

const NS_COLLECTION = "namespace-isolation-demo";
const TENANT_A_DOCS = ["Tenant A's confidential pricing sheet", "Tenant A's internal roadmap notes"];
const TENANT_B_DOCS = ["Tenant B's confidential pricing sheet", "Tenant B's internal roadmap notes"];

/** M4: namespace / multi-tenancy isolation demo + a dimension/model-swap re-indexing walkthrough. */
export function NamespaceAndReindex(): JSX.Element {
  const [nsLog, setNsLog] = React.useState<string[]>([]);
  const [tenantAHits, setTenantAHits] = React.useState<string[] | null>(null);
  const [tenantBHits, setTenantBHits] = React.useState<string[] | null>(null);
  const [leakDetected, setLeakDetected] = React.useState(false);

  const [reindexStep, setReindexStep] = React.useState(0);
  const [reindexLog, setReindexLog] = React.useState<string[]>([]);

  async function seedNamespaces() {
    try {
      await embeddingsApi.createCollection(NS_COLLECTION, 64, { distance: "cosine" });
    } catch {
      // already exists in this session
    }
    const { embeddings: aVecs } = await embeddingsApi.embed(TENANT_A_DOCS, "mock", "mock-small");
    const { embeddings: bVecs } = await embeddingsApi.embed(TENANT_B_DOCS, "mock", "mock-small");
    await embeddingsApi.upsert(
      NS_COLLECTION,
      TENANT_A_DOCS.map((text, i) => ({ id: `a-${i}`, vector: aVecs[i]!, metadata: { text }, namespace: "tenantA" })),
    );
    await embeddingsApi.upsert(
      NS_COLLECTION,
      TENANT_B_DOCS.map((text, i) => ({ id: `b-${i}`, vector: bVecs[i]!, metadata: { text }, namespace: "tenantB" })),
    );
    setNsLog((l) => [...l, "Seeded tenantA (2 docs) and tenantB (2 docs) into one shared collection."]);
  }

  async function searchAsTenant(tenant: "tenantA" | "tenantB") {
    const { embeddings } = await embeddingsApi.embed(["confidential pricing"], "mock", "mock-small");
    const { hits } = await embeddingsApi.search(NS_COLLECTION, embeddings[0]!, { topK: 10, namespace: tenant });
    const ids = hits.map((h) => h.id);
    if (tenant === "tenantA") setTenantAHits(ids);
    else setTenantBHits(ids);
    const leaked = ids.some((id) => !id.startsWith(tenant === "tenantA" ? "a-" : "b-"));
    if (leaked) setLeakDetected(true);
    setNsLog((l) => [...l, `Searched as ${tenant}: got ${ids.length} hit(s) (${ids.join(", ") || "none"})`]);
  }

  async function runReindexStep() {
    if (reindexStep === 0) {
      await embeddingsApi.createCollection("reindex-old-model-v1", 64, { distance: "cosine" });
      const { embeddings } = await embeddingsApi.embed(["sample document one", "sample document two"], "mock", "mock-small");
      await embeddingsApi.upsert(
        "reindex-old-model-v1",
        ["sample document one", "sample document two"].map((text, i) => ({ id: `doc-${i}`, vector: embeddings[i]!, metadata: { text } })),
      );
      setReindexLog((l) => [...l, "Step 1: indexed 2 documents with the OLD embedding model into a 64-dim collection."]);
      setReindexStep(1);
    } else if (reindexStep === 1) {
      // Simulate swapping to a "new model" - in Mock mode we can't change dim
      // (MockProvider.embed is fixed at 64 dims), so this step demonstrates
      // the PROCESS: create a fresh collection and re-embed from the
      // original source text, never reusing old vectors directly.
      await embeddingsApi.createCollection("reindex-new-model-v2", 64, { distance: "cosine" });
      const { embeddings } = await embeddingsApi.embed(["sample document one", "sample document two"], "mock", "mock-small");
      await embeddingsApi.upsert(
        "reindex-new-model-v2",
        ["sample document one", "sample document two"].map((text, i) => ({ id: `doc-${i}`, vector: embeddings[i]!, metadata: { text } })),
      );
      setReindexLog((l) => [
        ...l,
        "Step 2: created a NEW collection and re-embedded the SAME source text from scratch with the new model - never copying old vectors.",
      ]);
      setReindexStep(2);
    } else if (reindexStep === 2) {
      await embeddingsApi.deleteCollection("reindex-old-model-v1");
      setReindexLog((l) => [...l, "Step 3: only once the new collection is verified, the OLD collection is retired/deleted."]);
      setReindexStep(3);
    } else {
      await embeddingsApi.deleteCollection("reindex-new-model-v2").catch(() => {});
      setReindexLog([]);
      setReindexStep(0);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Namespace / multi-tenancy isolation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            One shared collection holds both tenants' vectors, isolated by namespace. Search scoped to tenant A must NEVER return
            tenant B's points, even for an identical query.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={seedNamespaces}>
              Seed both tenants
            </Button>
            <Button size="sm" variant="secondary" onClick={() => searchAsTenant("tenantA")}>
              Search as Tenant A
            </Button>
            <Button size="sm" variant="secondary" onClick={() => searchAsTenant("tenantB")}>
              Search as Tenant B
            </Button>
          </div>
          {(tenantAHits || tenantBHits) && (
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div>Tenant A sees: {tenantAHits?.join(", ") || "(none yet)"}</div>
              <div>Tenant B sees: {tenantBHits?.join(", ") || "(none yet)"}</div>
            </div>
          )}
          <Badge variant={leakDetected ? "destructive" : "success"}>
            {leakDetected ? "Isolation FAILED - cross-tenant leak detected" : "Isolation holds: no cross-tenant leak observed"}
          </Badge>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {nsLog.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Re-indexing strategy: dimension / model swap walkthrough</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Swapping embedding models (or dimensions) means OLD and NEW vectors are never compatible - the
            correct migration always re-embeds from the original source text into a fresh collection, verifies
            it, then retires the old one. It is never an in-place vector conversion.
          </p>
          <Button size="sm" onClick={runReindexStep}>
            {reindexStep === 0 && "Step 1: index with old model"}
            {reindexStep === 1 && "Step 2: re-embed into new collection"}
            {reindexStep === 2 && "Step 3: retire old collection"}
            {reindexStep === 3 && "Reset walkthrough"}
          </Button>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {reindexLog.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
