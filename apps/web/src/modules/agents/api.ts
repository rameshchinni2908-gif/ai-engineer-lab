import type { AgentRun, ToolDefinition, ToolResult } from "@ail/shared";
import { apiFetch } from "@/lib/api";

/** `GET /api/agents/tools` - module-local fetcher per docs/component-api.md §13. */
export function getAgentTools(): Promise<{ tools: ToolDefinition[] }> {
  return apiFetch("/agents/tools");
}

/** `GET /api/agents/:id` */
export function getAgentRun(id: string): Promise<AgentRun> {
  return apiFetch(`/agents/${id}`);
}

export interface AgentMemorySnapshotResponse {
  shortTerm: unknown[];
  longTerm: { id: string; score: number; metadata: Record<string, unknown> }[];
  summary: string;
  retrievals: { stepIndex: number; query: string; hits: { id: string; score: number; metadata: Record<string, unknown> }[] }[];
}

/** `GET /api/agents/:id/memory` */
export function getAgentMemory(id: string): Promise<AgentMemorySnapshotResponse> {
  return apiFetch(`/agents/${id}/memory`);
}

/** `POST /api/agents/:id/approve` */
export function approveAgentStep(
  id: string,
  body: { stepIndex: number; approved: boolean; note?: string },
): Promise<{ ok: true }> {
  return apiFetch(`/agents/${id}/approve`, { method: "POST", body });
}

export interface McpServerInfo {
  id: string;
  name: string;
  url?: string;
  status: "connected" | "disconnected";
}

/** `GET /api/mcp/servers` */
export function getMcpServers(): Promise<{ servers: McpServerInfo[] }> {
  return apiFetch("/mcp/servers");
}

/** `GET /api/mcp/servers/:id/tools` */
export function getMcpServerTools(serverId: string): Promise<{ tools: ToolDefinition[] }> {
  return apiFetch(`/mcp/servers/${serverId}/tools`);
}

/** `POST /api/mcp/servers/:id/tools/:toolName/call` */
export function callMcpTool(serverId: string, toolName: string, args: unknown): Promise<ToolResult> {
  return apiFetch(`/mcp/servers/${serverId}/tools/${toolName}/call`, { method: "POST", body: { arguments: args } });
}
