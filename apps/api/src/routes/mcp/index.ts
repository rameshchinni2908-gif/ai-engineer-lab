import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseBody, parseParams } from "../../plugins/validation.js";
import { notFoundError } from "../../middleware/errors.js";
import { listServers, listServerTools, getServer, callServerTool } from "../../services/mcp/index.js";

const ServerIdParamsSchema = z.object({ id: z.string() });
const ToolCallParamsSchema = z.object({ id: z.string(), toolName: z.string() });
const ToolCallBodySchema = z.object({ arguments: z.unknown() });

/**
 * MCP (Model Context Protocol) client section, contracts §4-M6. Mock/local
 * only in this environment - see services/mcp/servers.ts. Explains, via
 * `GET /mcp/servers`, how an agent discovers externally-hosted tools rather
 * than relying solely on its hardcoded built-in registry.
 */
const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.get("/servers", async () => {
    return { servers: listServers() };
  });

  app.get("/servers/:id/tools", async (req) => {
    const { id } = parseParams(ServerIdParamsSchema, req);
    if (!getServer(id)) throw notFoundError(`MCP server "${id}" not found`);
    return { tools: listServerTools(id) ?? [] };
  });

  app.post("/servers/:id/tools/:toolName/call", async (req) => {
    const { id, toolName } = parseParams(ToolCallParamsSchema, req);
    if (!getServer(id)) throw notFoundError(`MCP server "${id}" not found`);
    const tools = listServerTools(id) ?? [];
    if (!tools.some((t) => t.name === toolName)) {
      throw notFoundError(`Tool "${toolName}" not found on MCP server "${id}"`);
    }
    const { arguments: toolArgs } = parseBody(ToolCallBodySchema, req);
    return callServerTool(id, toolName, toolArgs);
  });
};

export default mcpRoutes;
