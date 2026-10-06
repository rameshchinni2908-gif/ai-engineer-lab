import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { DatasetManager } from "./DatasetManager";
import { EvalRunner, type EvalRunnerParams } from "./EvalRunner";
import { JudgeBiasLab } from "./JudgeBiasLab";
import { CiGatePanel } from "./CiGatePanel";

/** Zipped onto content-writer's preset copy - a prompt-version id can't be meaningfully preset (it's whatever the user created in Prompt Engineering), so each preset instead drives the metric selection/variant count that IS observable in `EvalRunner`. */
const PRESET_PARAMS: Record<string, EvalRunnerParams> = {
  "evals-two-prompt-versions": { metricIds: ["exact_match", "latency", "cost"], variantCount: 2 },
  "evals-judge-position-bias-check": { metricIds: ["pairwise"], variantCount: 2 },
  "evals-rag-metric-breakdown": {
    metricIds: ["rag_faithfulness", "rag_answer_relevance", "rag_context_precision", "rag_context_recall"],
    variantCount: 1,
  },
  "evals-ci-gate-demo": { metricIds: ["exact_match"], variantCount: 2 },
};

export default function EvalsModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [appliedParams, setAppliedParams] = React.useState<EvalRunnerParams | undefined>();
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
      presets={
        <PresetPicker<EvalRunnerParams>
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
          <DatasetManager selectedDatasetId={selectedDatasetId} onSelectDataset={setSelectedDatasetId} />
          <EvalRunner
            datasetId={selectedDatasetId}
            onRunComplete={setActiveRunId}
            onSuiteComplete={setLatestSuiteResultId}
            appliedParams={appliedParams}
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
