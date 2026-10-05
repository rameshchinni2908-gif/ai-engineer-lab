import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { TokenizerVisualizer } from "./TokenizerVisualizer";
import { ContextWindowMeter } from "./ContextWindowMeter";
import { SamplingLab } from "./SamplingLab";
import { ModelComparison } from "./ModelComparison";

interface FundamentalsPresetParams {
  temperature?: number;
  n?: number;
}

/** Zipped onto content-writer's preset copy - this module owns what each preset actually does. */
const PRESET_PARAMS: Record<string, FundamentalsPresetParams> = {
  "fundamentals-temp-0-vs-1-2": { temperature: 0 },
  "fundamentals-n-samples-self-consistency": { temperature: 0.8, n: 5 },
  "fundamentals-compare-models": {},
  "fundamentals-context-overflow": {},
};

export default function FundamentalsModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const content = MODULE_CONTENT.fundamentals;
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="fundamentals"
      title="LLM Fundamentals"
      description="Tokenization, context windows, and sampling - the knobs that drive every generation call."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<FundamentalsPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => setActivePresetId(p.id)}
        />
      }
      playground={
        <div className="space-y-6">
          <TokenizerVisualizer />
          <ContextWindowMeter />
          <SamplingLab onRunComplete={setActiveRunId} />
        </div>
      }
      experiments={<ModelComparison onRunComplete={setActiveRunId} />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
