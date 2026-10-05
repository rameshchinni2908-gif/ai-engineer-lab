import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { UploadAndIngest } from "./UploadAndIngest";
import { QueryPlayground } from "./QueryPlayground";
import { FailureModeLab } from "./FailureModeLab";
import { RagVsLongContextGuide } from "./RagVsLongContextGuide";
import type { RagStrategy } from "./api";

interface RagPresetParams {
  strategy?: RagStrategy;
}

const PRESET_PARAMS: Record<string, RagPresetParams> = {
  "rag-strategy-comparison": { strategy: "hyde" },
  "rag-failure-mode-tour": {},
  "rag-chunk-size-200-vs-1000": {},
  "rag-compression-on-off": { strategy: "compression" },
};

const DEFAULT_COLLECTION = "rag-playground";

export default function RagModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [collection] = React.useState(DEFAULT_COLLECTION);
  const [presetStrategyHint, setPresetStrategyHint] = React.useState<RagStrategy | undefined>();
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
            setPresetStrategyHint(p.params?.strategy);
          }}
        />
      }
      playground={
        <div className="space-y-6">
          <UploadAndIngest collection={collection} />
          <QueryPlayground
            key={presetStrategyHint}
            collection={collection}
            onRunComplete={setActiveRunId}
            initialStrategy={presetStrategyHint}
          />
        </div>
      }
      experiments={
        <div className="space-y-6">
          <FailureModeLab collection={collection} onRunComplete={setActiveRunId} />
          <RagVsLongContextGuide />
        </div>
      }
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
