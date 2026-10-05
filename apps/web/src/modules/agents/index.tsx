import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { AgentPlayground, type AgentPlaygroundParams } from "./AgentPlayground";
import { AgentsExperiments } from "./AgentsExperiments";

/** Zipped onto content-writer's preset copy (ids from `MODULE_CONTENT.agents.presets`) - this module owns what each preset actually configures. */
const PRESET_PARAMS: Record<string, AgentPlaygroundParams> = {
  "agents-tool-use-trace": {
    runtime: "react",
    goal: "Research what ReAct agents are and compute 12 * 8 as a sanity check.",
    toolAllowList: ["web_search", "vector_search", "calculator"],
    maxSteps: 15,
  },
  "agents-loop-detection-trigger": {
    runtime: "react",
    goal: "Compute 5 / 0 as many times as it takes to get an answer",
    toolAllowList: ["calculator"],
    maxSteps: 50,
  },
  "agents-hitl-approval-flow": {
    runtime: "react",
    goal: "Run some code to double-check a calculation.",
    toolAllowList: ["code_sandbox"],
    requireApprovalForDangerousTools: true,
  },
  "agents-mcp-tool-discovery": {
    runtime: "react",
    goal: "Search the docs for information about MCP.",
    toolAllowList: ["web_search"],
  },
};

export default function AgentsModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [appliedParams, setAppliedParams] = React.useState<AgentPlaygroundParams | undefined>();
  const content = MODULE_CONTENT.agents;

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="agents"
      title="Agents (+ MCP)"
      description="Four agent runtimes, six sandboxed tools, inspectable memory, and the five controls that keep a loop from running away."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<AgentPlaygroundParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => {
            setActivePresetId(p.id);
            setAppliedParams(p.params);
          }}
        />
      }
      playground={<AgentPlayground onRunComplete={setActiveRunId} appliedParams={appliedParams} />}
      experiments={<AgentsExperiments />}
      pitfalls={<PitfallsList pitfalls={content.pitfalls} />}
      activeRunId={activeRunId}
    />
  );
}
