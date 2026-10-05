import { useState } from "react";
import { ModuleShell, PresetPicker } from "@/components";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnTabContent";
import { ProductionPlayground } from "./ProductionPlayground";
import { ProductionExperiments } from "./ProductionExperiments";

export default function ProductionModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [activePresetId, setActivePresetId] = useState<string | undefined>();
  const content = MODULE_CONTENT.production;
  const activePreset = content.presets.find((p) => p.id === activePresetId);

  return (
    <ModuleShell
      moduleId="production"
      title="Production / Cost / Observability"
      description="Tracing, measured cost levers, reliability, versioning, and latency - all against real recorded runs."
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
      playground={<ProductionPlayground onRunComplete={setActiveRunId} />}
      experiments={<ProductionExperiments />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
