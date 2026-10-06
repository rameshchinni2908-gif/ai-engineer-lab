import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { EmbeddingExplorer } from "./EmbeddingExplorer";
import { SimilarityLab } from "./SimilarityLab";
import { ChunkingLab } from "./ChunkingLab";
import { VectorPlayground } from "./VectorPlayground";
import { IndexTradeoffs } from "./IndexTradeoffs";
import { HybridAndRerank } from "./HybridAndRerank";
import { NamespaceAndReindex } from "./NamespaceAndReindex";
import type { EmbeddingsPresetParams } from "./presetTypes";

/**
 * Each preset drives an ACTUAL control's value, not just `activePresetId` -
 * e.g. the "chunk size 200 vs 1000" preset really sets `ChunkingLab`'s
 * chunk-size input to 1000 (the module's central lesson, equivalent to M1's
 * `temperature: 0` preset), not merely a page scroll.
 */
const PRESET_PARAMS: Record<string, EmbeddingsPresetParams> = {
  "embeddings-metric-showdown": {
    section: "similarity",
    simQuery: "a tiny red bicycle",
    simCandidates: [
      "a small red bike",
      "a massive industrial crane",
      "a tiny red bicycle repeated many times over and over to inflate its magnitude artificially",
      "quarterly earnings report",
    ],
  },
  "embeddings-chunk-size-200-vs-1000": { section: "chunking", chunkStrategy: "fixed", chunkSize: 1000, chunkOverlap: 100 },
  "embeddings-index-tradeoffs": { section: "index-tradeoffs", efSearch: 10, nprobe: 1 },
  "embeddings-hybrid-vs-vector-only": { section: "hybrid", hybridQuery: "SKU-48213", hybridTopK: 3 },
  "embeddings-rerank-before-after": { section: "hybrid", hybridQuery: "comfortable jacket", hybridTopK: 5 },
};

/**
 * M4: Embeddings & Vector DB. `embed()` is an `LLMProvider` method, so every
 * `/embeddings/embed` and `/vector/hybrid-search` call records a Run
 * (contracts.md §2.3, via `services/embeddings/embed.ts`) - each playground
 * sub-component reports its resulting `runId` here so the Run Inspector /
 * "Why this happened" panes show a real explanation of that embedding call.
 */
export default function EmbeddingsModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [appliedParams, setAppliedParams] = React.useState<EmbeddingsPresetParams | undefined>();
  const content = MODULE_CONTENT.embeddings;
  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  const sectionRefs = {
    similarity: React.useRef<HTMLDivElement>(null),
    chunking: React.useRef<HTMLDivElement>(null),
    "index-tradeoffs": React.useRef<HTMLDivElement>(null),
    hybrid: React.useRef<HTMLDivElement>(null),
  };

  return (
    <ModuleShell
      moduleId="embeddings"
      title="Embeddings & Vector DB"
      description="Projections, similarity metrics, chunking strategies, a vector store playground, index trade-offs, hybrid search, and reranking."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<EmbeddingsPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => {
            setActivePresetId(p.id);
            setAppliedParams(p.params);
            const section = p.params?.section;
            if (section) sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      }
      playground={
        <div className="space-y-6">
          <EmbeddingExplorer onRunComplete={setActiveRunId} />
          <div ref={sectionRefs.similarity}>
            <SimilarityLab onRunComplete={setActiveRunId} appliedParams={appliedParams} />
          </div>
          <div ref={sectionRefs.chunking}>
            <ChunkingLab appliedParams={appliedParams} />
          </div>
          <VectorPlayground onRunComplete={setActiveRunId} />
        </div>
      }
      experiments={
        <div className="space-y-6">
          <div ref={sectionRefs["index-tradeoffs"]}>
            <IndexTradeoffs appliedParams={appliedParams} />
          </div>
          <div ref={sectionRefs.hybrid}>
            <HybridAndRerank onRunComplete={setActiveRunId} appliedParams={appliedParams} />
          </div>
          <NamespaceAndReindex />
        </div>
      }
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
