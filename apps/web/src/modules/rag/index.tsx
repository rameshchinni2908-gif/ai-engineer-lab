import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { UploadAndIngest } from "./UploadAndIngest";
import { QueryPlayground } from "./QueryPlayground";
import { FailureModeLab } from "./FailureModeLab";
import { RagVsLongContextGuide } from "./RagVsLongContextGuide";
import type { RagPresetParams } from "./presetTypes";

/**
 * Each preset drives ACTUAL control values (strategy/topK/query/collection/
 * chunk size, or actually triggers the failure-mode demo) - not merely
 * `activePresetId`. `nimbus-kb` is the seeded demo corpus (`pnpm seed`).
 */
const PRESET_PARAMS: Record<string, RagPresetParams> = {
  "rag-strategy-comparison": {
    collection: "nimbus-kb",
    strategy: "hyde",
    query: "what about the second one?",
    topK: 4,
  },
  "rag-failure-mode-tour": { collection: "nimbus-kb", failureMode: "stale", query: "What is the current pricing?" },
  "rag-chunk-size-200-vs-1000": { collection: "nimbus-kb", chunkStrategy: "fixed", chunkSize: 1000, chunkOverlap: 100 },
  "rag-compression-on-off": { collection: "nimbus-kb", strategy: "compression", topK: 6 },
};

const DEFAULT_COLLECTION = "nimbus-kb";

export default function RagModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [collection, setCollection] = React.useState(DEFAULT_COLLECTION);
  const [appliedParams, setAppliedParams] = React.useState<RagPresetParams | undefined>();
  const content = MODULE_CONTENT.rag;
  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="rag"
      title="RAG"
      description="Upload, chunk, embed, index, retrieve, and generate with citations - every stage inspectable, plus advanced strategies and a failure-mode lab."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<RagPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => {
            setActivePresetId(p.id);
            setAppliedParams(p.params);
            if (p.params?.collection !== undefined) setCollection(p.params.collection);
          }}
        />
      }
      playground={
        <div className="space-y-6">
          <UploadAndIngest collection={collection} appliedParams={appliedParams} />
          <QueryPlayground collection={collection} onRunComplete={setActiveRunId} appliedParams={appliedParams} />
        </div>
      }
      experiments={
        <div className="space-y-6">
          <FailureModeLab collection={collection} onRunComplete={setActiveRunId} appliedParams={appliedParams} />
          <RagVsLongContextGuide />
        </div>
      }
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
