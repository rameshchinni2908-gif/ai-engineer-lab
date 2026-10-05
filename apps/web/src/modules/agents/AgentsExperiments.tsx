import * as React from "react";
import type { AgentRuntime } from "@ail/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";
import { useProviderModelStore } from "@/stores/provider-model";
import { McpSection } from "./McpSection";

const RUNTIME_OPTIONS: AgentRuntime[] = ["react", "plan_execute", "reflection", "supervisor_worker"];

const FIXED_LIMITS = {
  maxSteps: 15,
  budgetUsd: 5,
  timeoutMs: 20_000,
  loopDetection: { enabled: true, window: 3, similarityThreshold: 0.9 },
  requireApprovalForDangerousTools: false,
};

function RuntimeRunner({ runtime, goal, toolAllowList }: { runtime: AgentRuntime; goal: string; toolAllowList: string[] }): JSX.Element {
  const providerId = useProviderModelStore((s) => s.providerId);
  const model = useProviderModelStore((s) => s.model);
  const { status, runs, start } = useSse(
    "/api/agents/run",
    { runtime, goal, toolAllowList, providerId, model, limits: FIXED_LIMITS },
    { autoStart: false },
  );
  const [, runState] = Object.entries(runs)[0] ?? [undefined, undefined];
  const steps = (runState?.events ?? [])
    .filter((e): e is Extract<typeof e, { type: "agent_step" }> => e.type === "agent_step")
    .map((e) => e.step);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{runtime}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button size="sm" onClick={start} disabled={status === "connecting" || status === "streaming"}>
          {status === "connecting" || status === "streaming" ? "Running..." : "Run"}
        </Button>
        <StreamingRegion
          text={steps.map((s) => `[${s.type}] ${s.content}`).join("\n")}
          status={status === "streaming" ? "streaming" : status === "error" ? "error" : status === "done" ? "complete" : "idle"}
          label={`${runtime} trace`}
        />
        {runState?.run && (
          <p className="text-xs text-muted-foreground">
            {steps.length} steps &middot; ${runState.run.cost.totalCostUsd.toFixed(6)} &middot; {runState.run.latencyMs}ms &middot; stop:{" "}
            {String((runState.run.metadata as { stopReason?: unknown }).stopReason ?? "?")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Experiments tab: run the SAME goal through two runtimes side by side (real cost/latency/step-count comparison, not a canned table), plus the MCP client section. */
export function AgentsExperiments(): JSX.Element {
  const [goal, setGoal] = React.useState("Find 2 facts about ReAct agents and compute 6 * 7.");
  const [runtimeA, setRuntimeA] = React.useState<AgentRuntime>("react");
  const [runtimeB, setRuntimeB] = React.useState<AgentRuntime>("plan_execute");
  const toolAllowList = ["web_search", "calculator"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Compare two runtimes on the same goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="exp-goal">Goal (shared)</Label>
            <Textarea id="exp-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Runtime A</Label>
              <Select value={runtimeA} onValueChange={(v) => setRuntimeA(v as AgentRuntime)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIME_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RuntimeRunner runtime={runtimeA} goal={goal} toolAllowList={toolAllowList} />
            </div>
            <div>
              <Label>Runtime B</Label>
              <Select value={runtimeB} onValueChange={(v) => setRuntimeB(v as AgentRuntime)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIME_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RuntimeRunner runtime={runtimeB} goal={goal} toolAllowList={toolAllowList} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP client</CardTitle>
        </CardHeader>
        <CardContent>
          <McpSection />
        </CardContent>
      </Card>
    </div>
  );
}
