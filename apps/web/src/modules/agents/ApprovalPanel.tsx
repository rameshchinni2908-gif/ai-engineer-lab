import * as React from "react";
import type { AgentStep } from "@ail/shared";
import { AlertTriangle } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { approveAgentStep } from "./api";

export interface ApprovalPanelProps {
  agentRunId: string;
  step: AgentStep;
  onResolved: () => void;
}

/**
 * Human-in-the-loop approval UI (deliverable #5). The SSE stream is
 * genuinely paused server-side while this is showing - nothing here is
 * decorative. Shows exactly what tool/arguments are pending, per the
 * "an approval UI must surface the full tool call so review is real, not
 * rubber-stamped" senior gotcha from this module's own content.
 */
export function ApprovalPanel({ agentRunId, step, onResolved }: ApprovalPanelProps): JSX.Element {
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function respond(approved: boolean): Promise<void> {
    setSubmitting(approved ? "approve" : "reject");
    setError(null);
    try {
      await approveAgentStep(agentRunId, { stepIndex: step.index, approved, note: note.trim() || undefined });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit the approval decision.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-amber-500 bg-amber-500/10 p-4" role="alert">
      <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Approval required - the run is paused
      </div>
      <p className="text-sm">
        Tool: <code className="rounded bg-background px-1">{step.toolCall?.name}</code>
      </p>
      <pre className="overflow-x-auto rounded-md bg-background p-2 text-xs">
        {JSON.stringify(step.toolCall?.arguments, null, 2)}
      </pre>
      <div>
        <Label htmlFor="approval-note">Reviewer note (optional)</Label>
        <Input id="approval-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why approve/reject?" />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => respond(true)} disabled={submitting !== null}>
          {submitting === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button variant="destructive" onClick={() => respond(false)} disabled={submitting !== null}>
          {submitting === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
