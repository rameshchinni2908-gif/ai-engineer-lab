import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentLimits, AgentRuntime, AgentStep, SseEvent } from "@ail/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Textarea,
} from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";
import { getAgentTools } from "./api";
import { ApprovalPanel } from "./ApprovalPanel";
import { AgentTraceViews } from "./AgentTraceViews";
import { MemoryInspector } from "./MemoryInspector";

const RUNTIMES: { id: AgentRuntime; label: string }[] = [
  { id: "react", label: "ReAct (thought -> tool_call -> tool_result -> repeat)" },
  { id: "plan_execute", label: "Plan-and-execute (plan upfront, then run it)" },
  { id: "reflection", label: "Reflection (act -> critique -> revise)" },
  { id: "supervisor_worker", label: "Supervisor-worker (delegates to workers)" },
];

export interface AgentPlaygroundParams {
  runtime?: AgentRuntime;
  goal?: string;
  toolAllowList?: string[];
  requireApprovalForDangerousTools?: boolean;
  maxSteps?: number;
  budgetUsd?: number;
}

export interface AgentPlaygroundProps {
  onRunComplete?: (runId: string) => void;
  /** Applied params from a `<PresetPicker>` selection; re-applied whenever a new preset is chosen. */
  appliedParams?: AgentPlaygroundParams;
}

function stepsOf(events: SseEvent[]): AgentStep[] {
  return events
    .filter((e): e is Extract<SseEvent, { type: "agent_step" }> => e.type === "agent_step")
    .map((e) => e.step);
}

/** M6 playground: configure a runtime + tools + the five controls, run it, and watch the live trace. */
export function AgentPlayground({ onRunComplete, appliedParams }: AgentPlaygroundProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);

  const [runtime, setRuntime] = React.useState<AgentRuntime>("react");
  const [goal, setGoal] = React.useState("Research loop detection and summarize it using 2 + 2 as a sanity check.");
  const [toolAllowList, setToolAllowList] = React.useState<string[]>(["web_search", "calculator"]);
  const [maxSteps, setMaxSteps] = React.useState(12);
  const [budgetUsd, setBudgetUsd] = React.useState(1);
  const [timeoutMs, setTimeoutMs] = React.useState(20_000);
  const [loopEnabled, setLoopEnabled] = React.useState(true);
  const [loopWindow, setLoopWindow] = React.useState(3);
  const [loopThreshold, setLoopThreshold] = React.useState(0.9);
  const [requireApproval, setRequireApproval] = React.useState(false);

  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.runtime) setRuntime(appliedParams.runtime);
    if (appliedParams.goal) setGoal(appliedParams.goal);
    if (appliedParams.toolAllowList) setToolAllowList(appliedParams.toolAllowList);
    if (appliedParams.requireApprovalForDangerousTools !== undefined) {
      setRequireApproval(appliedParams.requireApprovalForDangerousTools);
    }
    if (appliedParams.maxSteps) setMaxSteps(appliedParams.maxSteps);
    if (appliedParams.budgetUsd !== undefined) setBudgetUsd(appliedParams.budgetUsd);
  }, [appliedParams]);

  const toolsQuery = useQuery({ queryKey: ["agent-tools"], queryFn: getAgentTools });

  const limits: AgentLimits = {
    maxSteps,
    budgetUsd,
    timeoutMs,
    loopDetection: { enabled: loopEnabled, window: loopWindow, similarityThreshold: loopThreshold },
    requireApprovalForDangerousTools: requireApproval,
  };

  const { status, runs, error, start } = useSse(
    "/api/agents/run",
    { runtime, goal, toolAllowList, providerId, model, limits },
    { autoStart: false },
  );
  useRunShortcut(start);

  const [agentRunId, runState] = Object.entries(runs)[0] ?? [undefined, undefined];
  const steps = runState ? stepsOf(runState.events) : [];
  const latestStep = steps[steps.length - 1];
  const isAwaitingApproval =
    runState?.status === "streaming" && latestStep?.type === "approval_request" && !runState.run;
  const terminalStatus = runState?.run ? (runState.run.status === "error" ? "error" : "complete") : undefined;

  const notifiedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (runState?.run && notifiedRef.current !== runState.run.id) {
      notifiedRef.current = runState.run.id;
      onRunComplete?.(runState.run.id);
    }
  }, [runState?.run, onRunComplete]);

  const traceText = steps.map((s) => `[${s.type}] ${s.content}`).join("\n");
  const streamStatus = status === "connecting" ? "idle" : status === "streaming" ? "streaming" : status === "error" ? "error" : status === "done" ? "complete" : "idle";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Configure the agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderModelSelector
            providerId={providerId}
            model={model}
            onChange={(next) => {
              setProviderId(next.providerId);
              setModel(next.model);
            }}
          />

          <div>
            <Label>Runtime</Label>
            <Select value={runtime} onValueChange={(v) => setRuntime(v as AgentRuntime)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUNTIMES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="agent-goal">Goal</Label>
            <Textarea id="agent-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">
              <GlossaryTerm id="tool-registry">Tool allow-list</GlossaryTerm> (the real security boundary)
            </legend>
            <div className="flex flex-wrap gap-3">
              {toolsQuery.data?.tools.map((tool) => (
                <label key={tool.name} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={toolAllowList.includes(tool.name)}
                    onChange={(e) =>
                      setToolAllowList((prev) =>
                        e.target.checked ? [...prev, tool.name] : prev.filter((n) => n !== tool.name),
                      )
                    }
                  />
                  {tool.name}
                  {tool.dangerous && <Badge variant="destructive">dangerous</Badge>}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="agent-maxsteps">maxSteps</Label>
              <Input id="agent-maxsteps" type="number" min={1} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value) || 1)} />
            </div>
            <div>
              <Label htmlFor="agent-budget">budgetUsd</Label>
              <Input id="agent-budget" type="number" min={0} step={0.01} value={budgetUsd} onChange={(e) => setBudgetUsd(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="agent-timeout">timeoutMs</Label>
              <Input id="agent-timeout" type="number" min={0} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="agent-approval" checked={requireApproval} onCheckedChange={setRequireApproval} />
              <Label htmlFor="agent-approval">
                <GlossaryTerm id="human-in-the-loop">Require approval</GlossaryTerm> for dangerous tools
              </Label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Switch id="agent-loop" checked={loopEnabled} onCheckedChange={setLoopEnabled} />
              <Label htmlFor="agent-loop">
                <GlossaryTerm id="loop-detection">Loop detection</GlossaryTerm>
              </Label>
            </div>
            <div>
              <Label>Window: {loopWindow}</Label>
              <Slider value={[loopWindow]} min={2} max={8} step={1} onValueChange={([v]) => setLoopWindow(v!)} disabled={!loopEnabled} />
            </div>
            <div>
              <Label>Similarity threshold: {loopThreshold.toFixed(2)}</Label>
              <Slider value={[loopThreshold]} min={0.5} max={1} step={0.05} onValueChange={([v]) => setLoopThreshold(v!)} disabled={!loopEnabled} />
            </div>
          </div>

          <Button onClick={start} disabled={status === "connecting" || status === "streaming" || toolAllowList.length === 0}>
            {status === "connecting" || status === "streaming" ? "Running..." : "Run agent (Ctrl/Cmd+Enter)"}
          </Button>
          {toolAllowList.length === 0 && <p className="text-xs text-muted-foreground">Select at least one tool.</p>}
          {error && <ErrorState message={error.message} />}
        </CardContent>
      </Card>

      {steps.length > 0 && (
        <StreamingRegion text={traceText} status={streamStatus} label="Agent trace" />
      )}

      {isAwaitingApproval && agentRunId && latestStep && (
        <ApprovalPanel agentRunId={agentRunId} step={latestStep} onResolved={() => undefined} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live trace</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTraceViews steps={steps} isAwaitingApproval={Boolean(isAwaitingApproval)} terminalStatus={terminalStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Memory inspector</CardTitle>
        </CardHeader>
        <CardContent>
          <MemoryInspector agentRunId={agentRunId} isRunning={status === "streaming"} />
        </CardContent>
      </Card>
    </div>
  );
}
