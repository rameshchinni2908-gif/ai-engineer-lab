import type { ToolDefinition, ToolResult } from "@ail/shared";
import { calculatorDefinition, runCalculator } from "./calculator.js";
import { webSearchDefinition, runWebSearch } from "./web-search.js";
import { vectorSearchDefinition, runVectorSearch } from "./vector-search.js";
import { codeSandboxDefinition, runCodeSandbox } from "./code-sandbox.js";
import { fileReaderDefinition, runFileReader } from "./file-reader.js";
import { httpFetchDefinition, runHttpFetch } from "./http-fetch.js";
import type { RegisteredTool } from "./types.js";

/** The six built-in agent tools from CLAUDE.md / the agent-engineer brief. */
export const AGENT_TOOLS: RegisteredTool[] = [
  { definition: calculatorDefinition, execute: runCalculator },
  { definition: webSearchDefinition, execute: runWebSearch },
  { definition: vectorSearchDefinition, execute: runVectorSearch },
  { definition: codeSandboxDefinition, execute: runCodeSandbox },
  { definition: fileReaderDefinition, execute: runFileReader },
  { definition: httpFetchDefinition, execute: runHttpFetch },
];

export function listAgentToolDefinitions(): ToolDefinition[] {
  return AGENT_TOOLS.map((t) => t.definition);
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.definition.name === name)?.definition;
}

export function isDangerousTool(name: string): boolean {
  return getToolDefinition(name)?.dangerous === true;
}

/** Executes a built-in tool by name, wrapping the outcome into a full `ToolResult` with timing. */
export async function executeBuiltinTool(toolCallId: string, name: string, args: unknown): Promise<ToolResult> {
  const tool = AGENT_TOOLS.find((t) => t.definition.name === name);
  const start = Date.now();
  if (!tool) {
    return { toolCallId, content: `Unknown tool "${name}"`, isError: true, durationMs: Date.now() - start };
  }
  const outcome = await tool.execute(args);
  return { toolCallId, content: outcome.content, isError: outcome.isError, durationMs: Date.now() - start };
}
