import type { ToolDefinition, ToolResult } from "@ail/shared";

/**
 * Mock/local-only MCP (Model Context Protocol) servers. This environment
 * never requires (or attempts to reach) a real external MCP server - two
 * small in-process mock servers are registered unconditionally so the MCP
 * section of the UI, and agent runs that opt into an MCP tool, both work
 * with zero setup. If a real MCP client/transport is added later, this is
 * the seam to extend (`listServers`/`listServerTools`/`callServerTool`
 * would gain a real-transport branch alongside these mocks).
 */
export interface McpServerInfo {
  id: string;
  name: string;
  url?: string;
  status: "connected" | "disconnected";
}

interface McpTool {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<{ content: string; isError: boolean }>;
}

interface McpServer extends McpServerInfo {
  tools: McpTool[];
}

const DOCS_SERVER: McpServer = {
  id: "docs-server",
  name: "Docs MCP Server (mock)",
  status: "connected",
  tools: [
    {
      definition: {
        name: "search_docs",
        description: "Searches a small mock documentation index exposed by this MCP server.",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        category: "search",
      },
      execute: async (args: unknown) => {
        const query = (args as { query?: unknown })?.query;
        if (typeof query !== "string" || query.length === 0) {
          return { content: "search_docs: missing required string argument 'query'", isError: true };
        }
        return {
          content: JSON.stringify({
            query,
            results: [{ page: "mcp-quickstart", excerpt: `Mock excerpt mentioning "${query}" from the docs server.` }],
          }),
          isError: false,
        };
      },
    },
    {
      definition: {
        name: "get_page",
        description: "Fetches one mock documentation page by id.",
        inputSchema: { type: "object", properties: { pageId: { type: "string" } }, required: ["pageId"] },
        category: "retrieval",
      },
      execute: async (args: unknown) => {
        const pageId = (args as { pageId?: unknown })?.pageId;
        if (typeof pageId !== "string" || pageId.length === 0) {
          return { content: "get_page: missing required string argument 'pageId'", isError: true };
        }
        return { content: `Mock page content for "${pageId}".`, isError: false };
      },
    },
  ],
};

const ISSUES_SERVER: McpServer = {
  id: "issues-server",
  name: "Issue Tracker MCP Server (mock)",
  status: "connected",
  tools: [
    {
      definition: {
        name: "list_issues",
        description: "Lists a small set of mock open issues exposed by this MCP server.",
        inputSchema: { type: "object", properties: { label: { type: "string" } } },
        category: "other",
      },
      execute: async (args: unknown) => {
        const label = (args as { label?: unknown })?.label;
        const issues = [
          { id: 101, title: "Agent loop detection false negative", label: "agents" },
          { id: 102, title: "HTTP fetch tool allow-list too permissive", label: "security" },
        ].filter((i) => (typeof label === "string" && label.length > 0 ? i.label === label : true));
        return { content: JSON.stringify({ issues }), isError: false };
      },
    },
  ],
};

const SERVERS: McpServer[] = [DOCS_SERVER, ISSUES_SERVER];

export function listServers(): McpServerInfo[] {
  return SERVERS.map(({ tools: _tools, ...info }) => info);
}

export function getServer(id: string): McpServer | undefined {
  return SERVERS.find((s) => s.id === id);
}

export function listServerTools(serverId: string): ToolDefinition[] | undefined {
  return getServer(serverId)?.tools.map((t) => t.definition);
}

/** Finds a tool by name across ALL mock servers - used by the agent engine so an allow-listed MCP tool name resolves regardless of which server exposes it. */
export function findToolAcrossServers(toolName: string): { serverId: string; tool: McpTool } | undefined {
  for (const server of SERVERS) {
    const tool = server.tools.find((t) => t.definition.name === toolName);
    if (tool) return { serverId: server.id, tool };
  }
  return undefined;
}

export async function callServerTool(serverId: string, toolName: string, args: unknown): Promise<ToolResult> {
  const start = Date.now();
  const server = getServer(serverId);
  if (!server) {
    return { toolCallId: `mcp_${toolName}`, content: `Unknown MCP server "${serverId}"`, isError: true, durationMs: Date.now() - start };
  }
  const tool = server.tools.find((t) => t.definition.name === toolName);
  if (!tool) {
    return { toolCallId: `mcp_${toolName}`, content: `Unknown tool "${toolName}" on server "${serverId}"`, isError: true, durationMs: Date.now() - start };
  }
  const outcome = await tool.execute(args);
  return { toolCallId: `mcp_${toolName}`, content: outcome.content, isError: outcome.isError, durationMs: Date.now() - start };
}
