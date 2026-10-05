import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { ModeComparison } from "./ModeComparison";
import { SchemaEditor } from "./SchemaEditor";
import { RepairLoopViz } from "./RepairLoopViz";
import { ToolCallPlayground } from "./ToolCallPlayground";

interface StructuredPresetParams {
  note?: string;
}

const PRESET_PARAMS: Record<string, StructuredPresetParams> = {
  "structured-json-mode-vs-schema": {},
  "structured-repair-attempts": {},
  "structured-parallel-tool-calls": {},
  "structured-malformed-tool-args": {},
};

export default function StructuredModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const content = MODULE_CONTENT.structured;
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="structured"
      title="Structured Output & Tools"
      description="JSON mode vs schema-constrained vs forced-tool, schema validation, repair loops, and tool calling."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<StructuredPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => setActivePresetId(p.id)}
        />
      }
      playground={
        <div className="space-y-6">
          <ModeComparison onRunComplete={setActiveRunId} />
          <SchemaEditor />
          <ToolCallPlayground onRunComplete={setActiveRunId} />
        </div>
      }
      experiments={<RepairLoopViz onRunComplete={setActiveRunId} />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
