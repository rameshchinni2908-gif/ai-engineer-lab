import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { PromptAnatomyBuilder } from "./PromptAnatomyBuilder";
import { TechniqueDemos } from "./TechniqueDemos";
import { PromptCoach } from "./PromptCoach";
import { PromptVersions } from "./PromptVersions";
import { InjectionSafeTemplating } from "./InjectionSafeTemplating";

interface PromptingPresetParams {
  note?: string;
}

const PRESET_PARAMS: Record<string, PromptingPresetParams> = {
  "prompting-technique-shootout": {},
  "prompting-self-consistency-vote": {},
  "prompting-injection-safe-template": {},
  "prompting-coach-before-after": {},
};

export default function PromptingModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const content = MODULE_CONTENT.prompting;
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="prompting"
      title="Prompt Engineering"
      description="Anatomy, techniques, coaching, versioning, and injection-safe templating."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<PromptingPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => setActivePresetId(p.id)}
        />
      }
      playground={
        <div className="space-y-6">
          <PromptAnatomyBuilder />
          <TechniqueDemos onRunComplete={setActiveRunId} />
          <PromptCoach onRunComplete={setActiveRunId} />
        </div>
      }
      experiments={
        <div className="space-y-6">
          <PromptVersions onRunComplete={setActiveRunId} />
          <InjectionSafeTemplating />
        </div>
      }
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
