import * as React from "react";
import { ArrowRight } from "lucide-react";
import type { AgentStep, AgentStepType } from "@ail/shared";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const STEP_VARIANT: Record<AgentStepType, BadgeVariant> = {
  thought: "outline",
  plan: "outline",
  reflection: "secondary",
  delegate: "secondary",
  tool_call: "default",
  tool_result: "default",
  final: "success",
  error: "destructive",
  approval_request: "warning",
};

const NODE_BORDER: Record<AgentStepType, string> = {
  thought: "border-border",
  plan: "border-border",
  reflection: "border-violet-400",
  delegate: "border-violet-400",
  tool_call: "border-blue-400",
  tool_result: "border-blue-400",
  final: "border-emerald-500",
  error: "border-destructive",
  approval_request: "border-amber-500",
};

export interface AgentTraceViewsProps {
  steps: AgentStep[];
  /** Stream is genuinely paused on an unresolved `approval_request` right now. */
  isAwaitingApproval: boolean;
  /** Set once the run has actually terminated (from the wrapper `Run.status`). */
  terminalStatus?: "complete" | "error";
}

interface RunningRow {
  step: AgentStep;
  runningTokens: number;
  runningCostUsd: number;
  runningDurationMs: number;
}

function withRunningTotals(steps: AgentStep[]): RunningRow[] {
  let tokens = 0;
  let cost = 0;
  let durationMs = 0;
  return steps.map((step) => {
    tokens += step.usage?.totalTokens ?? 0;
    cost += step.cost?.totalCostUsd ?? 0;
    durationMs += step.durationMs;
    return { step, runningTokens: tokens, runningCostUsd: cost, runningDurationMs: durationMs };
  });
}

/**
 * The "See" half of M6's trace surface: a live timeline (tokens/cost/
 * duration per step + running totals), a graph of the actual execution
 * (tool calls/delegations/retries as nodes+edges), and a state-machine
 * view of which runtime state the agent is in and the transitions it took.
 * All three are derived from the SAME real `steps` array - no synthetic data.
 */
export function AgentTraceViews({ steps, isAwaitingApproval, terminalStatus }: AgentTraceViewsProps): JSX.Element {
  if (steps.length === 0) {
    return <EmptyState title="No steps yet" description="Run the agent to see its live trace, graph, and state machine." />;
  }

  const rows = withRunningTotals(steps);

  return (
    <Tabs defaultValue="timeline">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="graph">Graph</TabsTrigger>
        <TabsTrigger value="state">State machine</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="space-y-2 pt-3">
        {rows.map(({ step, runningTokens, runningCostUsd, runningDurationMs }) => (
          <div key={step.index} className="rounded-md border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STEP_VARIANT[step.type]}>
                {step.index}. {step.type}
              </Badge>
              {step.usage && <Badge variant="outline">{step.usage.totalTokens} tok</Badge>}
              {step.cost && <Badge variant="outline">${step.cost.totalCostUsd.toFixed(6)}</Badge>}
              <Badge variant="outline">{step.durationMs}ms</Badge>
              <span className="text-xs text-muted-foreground">
                running total: {runningTokens} tok &middot; ${runningCostUsd.toFixed(6)} &middot; {runningDurationMs}ms
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{step.content}</p>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="graph" className="pt-3">
        <GraphView steps={steps} />
      </TabsContent>

      <TabsContent value="state" className="pt-3">
        <StateMachineView steps={steps} isAwaitingApproval={isAwaitingApproval} terminalStatus={terminalStatus} />
      </TabsContent>
    </Tabs>
  );
}

function GraphView({ steps }: { steps: AgentStep[] }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto pb-2" role="img" aria-label="Agent execution graph">
      {steps.map((step, i) => (
        <React.Fragment key={step.index}>
          <div
            className={cn("max-w-[11rem] rounded-md border-2 bg-background px-2 py-1 text-xs", NODE_BORDER[step.type])}
            title={step.content}
          >
            <div className="font-semibold">
              {step.index}. {step.type}
            </div>
            {step.toolCall && <div className="truncate text-muted-foreground">{step.toolCall.name}</div>}
          </div>
          {i < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </React.Fragment>
      ))}
    </div>
  );
}

type RuntimeState = "idle" | "running" | "awaiting_approval" | "complete" | "error";
const ALL_STATES: RuntimeState[] = ["idle", "running", "awaiting_approval", "complete", "error"];

function StateMachineView({
  steps,
  isAwaitingApproval,
  terminalStatus,
}: {
  steps: AgentStep[];
  isAwaitingApproval: boolean;
  terminalStatus?: "complete" | "error";
}): JSX.Element {
  const visitedApproval = steps.some((s) => s.type === "approval_request");
  const current: RuntimeState = terminalStatus ?? (isAwaitingApproval ? "awaiting_approval" : "running");
  const visited: RuntimeState[] = [
    "idle",
    "running",
    ...(visitedApproval ? (["awaiting_approval", "running"] as RuntimeState[]) : []),
    ...(terminalStatus ? [terminalStatus] : []),
  ];
  const transitionLabel = visited
    .filter((s, i) => i === 0 || s !== visited[i - 1])
    .join(" → ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ALL_STATES.filter((s) => s !== "error" || terminalStatus === "error").map((s) => (
          <Badge key={s} variant={s === current ? "default" : visited.includes(s) ? "secondary" : "outline"}>
            {s}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Transitions taken this run: {transitionLabel}
        {!terminalStatus && isAwaitingApproval ? " (currently paused here, awaiting /approve)" : ""}
      </p>
    </div>
  );
}
