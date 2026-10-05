import type { ToolDefinition } from "@ail/shared";

/** Outcome of running a tool, before the `durationMs`/`toolCallId` wrapping done by the caller. */
export interface ToolExecOutcome {
  content: string;
  isError: boolean;
}

export type ToolExecutor = (args: unknown) => Promise<ToolExecOutcome>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

export function ok(content: string): ToolExecOutcome {
  return { content, isError: false };
}

export function fail(content: string): ToolExecOutcome {
  return { content, isError: true };
}
