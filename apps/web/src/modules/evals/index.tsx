import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { DatasetManager } from "./DatasetManager";
import { EvalRunner } from "./EvalRunner";
import { JudgeBiasLab } from "./JudgeBiasLab";
import { CiGatePanel } from "./CiGatePanel";

interface EvalsPresetParams {
  note?: string;
}

const PRESET_PARAMS: Record<string, EvalsPresetParams> = {
  "evals-two-prompt-versions": {},
  "evals-judge-position-bias-check": {},
  "evals-rag-metric-breakdown": {},
  "evals-ci-gate-demo": {},
};

export default function EvalsModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [selectedDatasetId, setSelectedDatasetId] = React.useState<string | null>(null);
  const [latestSuiteResultId, setLatestSuiteResultId] = React.useState<string | null>(null);
  const content = MODULE_CONTENT.evals;

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="evals"
      title="Evals"
      description="Build a golden dataset, run it across prompt versions x models, and gate regressions."
      learn={<LearnTabContent content={content.learn} />}
      presets={<PresetPicker<EvalsPresetParams> presets={presets} activeId={activePresetId} onSelect={(p) => setActivePresetId(p.id)} />}
      playground={
        <div className="space-y-6">
          <DatasetManager selectedDatasetId={selectedDatasetId} onSelectDataset={setSelectedDatasetId} />
          <EvalRunner
            datasetId={selectedDatasetId}
            onRunComplete={setActiveRunId}
            onSuiteComplete={setLatestSuiteResultId}
          />
        </div>
      }
      experiments={
        <div className="space-y-6">
          <JudgeBiasLab />
          <CiGatePanel suiteResultId={latestSuiteResultId} />
        </div>
      }
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
