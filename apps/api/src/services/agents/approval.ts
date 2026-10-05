/**
 * Process-lifetime pending-approval registry for human-in-the-loop gates.
 * `POST /agents/run`'s SSE handler coroutine stays alive (the HTTP response
 * is held open via `openSseStream`'s `reply.hijack()`) while it `await`s the
 * promise registered here; `POST /agents/:id/approve` is a SEPARATE HTTP
 * request that resolves that same in-memory promise, letting the original
 * coroutine resume writing to its already-open SSE connection. Both
 * requests are handled by the same Node process/event loop, so no
 * cross-process signaling is needed.
 */
export interface ApprovalOutcome {
  approved: boolean;
  note?: string;
  timedOut?: boolean;
}

interface PendingApproval {
  stepIndex: number;
  resolve: (outcome: ApprovalOutcome) => void;
}

const PENDING = new Map<string, PendingApproval>();

export interface PendingApprovalHandle {
  promise: Promise<ApprovalOutcome>;
  /** Removes the pending entry without resolving it (e.g. after a timeout fires) so a late `/approve` call correctly 409s instead of resolving a dead wait. */
  cancel: () => void;
}

export function registerPendingApproval(agentRunId: string, stepIndex: number): PendingApprovalHandle {
  let resolveFn!: (outcome: ApprovalOutcome) => void;
  const promise = new Promise<ApprovalOutcome>((resolve) => {
    resolveFn = resolve;
  });
  PENDING.set(agentRunId, { stepIndex, resolve: resolveFn });
  return {
    promise,
    cancel: () => {
      PENDING.delete(agentRunId);
    },
  };
}

export function hasPendingApproval(agentRunId: string, stepIndex: number): boolean {
  const pending = PENDING.get(agentRunId);
  return pending !== undefined && pending.stepIndex === stepIndex;
}

/** `POST /agents/:id/approve`: resolves the pending wait. Returns `false` (route should 409) if there's no matching pending approval at that step index. */
export function resolveApproval(agentRunId: string, stepIndex: number, approved: boolean, note?: string): boolean {
  const pending = PENDING.get(agentRunId);
  if (!pending || pending.stepIndex !== stepIndex) return false;
  PENDING.delete(agentRunId);
  pending.resolve({ approved, note });
  return true;
}
