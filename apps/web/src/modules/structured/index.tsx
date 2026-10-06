import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { ModeComparison, type ModeComparisonAppliedParams } from "./ModeComparison";
import { SchemaEditor } from "./SchemaEditor";
import { RepairLoopViz, type RepairLoopVizAppliedParams } from "./RepairLoopViz";
import { ToolCallPlayground, type ToolCallPlaygroundAppliedParams } from "./ToolCallPlayground";

/**
 * Zipped onto content-writer's preset copy - this module owns what each
 * preset actually configures. Fields are a flat union across the three
 * playground/experiments children that presets can target; each child only
 * reads the fields it owns.
 */
interface StructuredPresetParams
  extends ModeComparisonAppliedParams,
    RepairLoopVizAppliedParams,
    ToolCallPlaygroundAppliedParams {}

const MALFORMED_TOOL_SCHEMA = JSON.stringify(
  { type: "object", properties: { amount: { type: "number", minimum: 0, maximum: 1000 } }, required: ["amount"] },
  null,
  2,
);

const PRESET_PARAMS: Record<string, StructuredPresetParams> = {
  "structured-json-mode-vs-schema": {
    prompt: "Describe the tradeoffs of RAG vs fine-tuning as structured JSON with topic/summary/confidence fields.",
  },
  "structured-repair-attempts": {
    invalidJson: '{"topic": "embeddings", "summry": "typo',
    schemaText: MALFORMED_TOOL_SCHEMA,
    maxAttempts: 3,
  },
  "structured-parallel-tool-calls": {
    question: "What is 12 * 7, how many words are in 'the quick brown fox', and what is 'tools' reversed?",
    toolChoice: "required",
  },
  "structured-malformed-tool-args": {
    question: "Calculate a transfer of 999999999 using the calculator tool.",
    toolChoice: "required",
  },
};

export default function StructuredModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const content = MODULE_CONTENT.structured;
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [appliedParams, setAppliedParams] = React.useState<StructuredPresetParams | undefined>();

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
          onSelect={(p) => {
            setActivePresetId(p.id);
            setAppliedParams(p.params);
          }}
        />
      }
      playground={
        <div className="space-y-6">
          <ModeComparison onRunComplete={setActiveRunId} appliedParams={appliedParams} />
          <SchemaEditor />
          <ToolCallPlayground onRunComplete={setActiveRunId} appliedParams={appliedParams} />
        </div>
      }
      experiments={<RepairLoopViz onRunComplete={setActiveRunId} appliedParams={appliedParams} />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
