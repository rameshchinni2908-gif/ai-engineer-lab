import { useState } from "react";
import { PresetPicker } from "@/components";
import { ModuleShell } from "@/components/ModuleShell";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnTabContent";
import { AdvancedPlayground } from "./AdvancedPlayground";
import { AdvancedExperiments } from "./AdvancedExperiments";

export default function AdvancedModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [activePresetId, setActivePresetId] = useState<string | undefined>();
  const content = MODULE_CONTENT.advanced;
  const activePreset = content.presets.find((p) => p.id === activePresetId);

  return (
    <ModuleShell
      moduleId="advanced"
      title="Advanced Concepts"
      description="Attention (illustrative), adaptation (pretrain/SFT/RLHF/DPO + decision matrix), multimodal, reasoning budgets, quantization, and synthetic data."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <div className="space-y-2">
          <PresetPicker presets={content.presets} activeId={activePresetId} onSelect={(p) => setActivePresetId(p.id)} />
          {activePreset && (
            <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
              Suggested walkthrough: {activePreset.description}
            </p>
          )}
        </div>
      }
      playground={<AdvancedPlayground onRunComplete={setActiveRunId} />}
      experiments={<AdvancedExperiments />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
