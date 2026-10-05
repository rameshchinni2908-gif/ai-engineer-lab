import { useState } from "react";
import { PresetPicker } from "@/components";
import { ModuleShell } from "@/components/ModuleShell";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnTabContent";
import { ChecklistPlayground } from "./ChecklistPlayground";
import { ChecklistExperiments } from "./ChecklistExperiments";

export default function ChecklistModulePage(): JSX.Element {
  const [activePresetId, setActivePresetId] = useState<string | undefined>();
  const content = MODULE_CONTENT.checklist;
  const activePreset = content.presets.find((p) => p.id === activePresetId);

  return (
    <ModuleShell
      moduleId="checklist"
      title="Glossary & Senior Checklist"
      description="A guided learning path, quizzes across every module, a design-review checklist, and system-design scenarios with reference architectures."
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
      playground={<ChecklistPlayground />}
      experiments={<ChecklistExperiments />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
    />
  );
}
