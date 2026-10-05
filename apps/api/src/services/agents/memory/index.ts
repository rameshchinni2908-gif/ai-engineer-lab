import type { AgentStep, VectorSearchHit } from "@ail/shared";
import { ShortTermMemory } from "./short-term.js";
import { LongTermMemory } from "./long-term.js";
import { SummaryMemory } from "./summary.js";

export * from "./short-term.js";
export * from "./long-term.js";
export * from "./summary.js";

export interface MemoryRetrievalLogEntry {
  stepIndex: number;
  query: string;
  hits: VectorSearchHit[];
}

export interface AgentMemorySnapshot {
  shortTerm: unknown[];
  longTerm: VectorSearchHit[];
  summary: string;
  /** Additive beyond the base contract shape: what was actually retrieved, and why (query), per step - makes long-term memory genuinely inspectable rather than just "all entries ever written". */
  retrievals: MemoryRetrievalLogEntry[];
}

/** Combines all three memory types for one agent run and records exactly what was written/retrieved at each step, for the UI's memory inspector panel. */
export class AgentMemory {
  readonly shortTerm = new ShortTermMemory();
  readonly longTerm = new LongTermMemory();
  readonly summaryMem = new SummaryMemory();
  #retrievals: MemoryRetrievalLogEntry[] = [];

  /** Call once per step; returns the `memoryWrites` entries to attach to that `AgentStep`. */
  recordStep(step: AgentStep): Record<string, unknown>[] {
    const writes: Record<string, unknown>[] = [];

    this.shortTerm.write({
      stepIndex: step.index,
      role: step.type === "tool_result" ? "tool" : "agent",
      content: step.content,
    });
    writes.push({ memory: "shortTerm", action: "write", stepIndex: step.index });

    if (step.type === "final" || step.type === "reflection" || step.type === "tool_result") {
      this.longTerm.write(`mem_${step.index}`, step.content, { stepType: step.type });
      writes.push({ memory: "longTerm", action: "write", stepIndex: step.index });
    }

    const summary = this.summaryMem.update(step.content);
    writes.push({ memory: "summary", action: "update", stepIndex: step.index, summaryLength: summary.length });
    return writes;
  }

  /** Call when a runtime (e.g. `reflection`, `supervisor_worker`) explicitly consults long-term memory. */
  retrieveLongTerm(stepIndex: number, query: string, topK = 3): VectorSearchHit[] {
    const hits = this.longTerm.search(query, topK);
    this.#retrievals.push({ stepIndex, query, hits });
    return hits;
  }

  snapshot(): AgentMemorySnapshot {
    return {
      shortTerm: this.shortTerm.all(),
      longTerm: this.longTerm.allByRecency(),
      summary: this.summaryMem.get(),
      retrievals: [...this.#retrievals],
    };
  }
}

/**
 * Process-lifetime registry keyed by `agentRunId`. Memory snapshots are
 * NOT persisted to SQLite (no dedicated table was added for this in Wave 0
 * - see the agent-engineer handoff notes); `GET /agents/:id/memory` is only
 * inspectable while this server process is alive, same lifetime as the
 * pending-approval registry in `approval.ts`. Each `AgentStep.memoryWrites`
 * (which IS persisted, per `@ail/shared`) still records that writes
 * happened even after a restart - only the full inspector replay is
 * process-lifetime-scoped.
 */
const REGISTRY = new Map<string, AgentMemory>();

export function createAgentMemory(agentRunId: string): AgentMemory {
  const mem = new AgentMemory();
  REGISTRY.set(agentRunId, mem);
  return mem;
}

export function getAgentMemory(agentRunId: string): AgentMemory | undefined {
  return REGISTRY.get(agentRunId);
}
