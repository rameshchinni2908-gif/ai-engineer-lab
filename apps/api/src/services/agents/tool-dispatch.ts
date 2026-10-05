import type { ToolDefinition, ToolResult } from "@ail/shared";
import { AGENT_TOOLS, getToolDefinition } from "./tools/registry.js";
import { findToolAcrossServers } from "../mcp/servers.js";

/** Unifies the built-in tool registry with every mock MCP server's tools, so an agent's `toolAllowList` can name either kind interchangeably. */
export function resolveToolDefinition(name: string): ToolDefinition | undefined {
  return getToolDefinition(name) ?? findToolAcrossServers(name)?.tool.definition;
}

export async function dispatchTool(toolCallId: string, name: string, args: unknown): Promise<ToolResult> {
  const start = Date.now();
  const builtin = AGENT_TOOLS.find((t) => t.definition.name === name);
  if (builtin) {
    const outcome = await builtin.execute(args);
    return { toolCallId, content: outcome.content, isError: outcome.isError, durationMs: Date.now() - start };
  }
  const mcp = findToolAcrossServers(name);
  if (mcp) {
    const outcome = await mcp.tool.execute(args);
    return { toolCallId, content: outcome.content, isError: outcome.isError, durationMs: Date.now() - start };
  }
  return {
    toolCallId,
    content: `Unknown tool "${name}" (not in the built-in registry or any configured MCP server).`,
    isError: true,
    durationMs: Date.now() - start,
  };
}
