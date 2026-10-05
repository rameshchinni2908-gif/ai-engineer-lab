import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ToolDefinition, ToolResult } from "@ail/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui";
import { getMcpServers, getMcpServerTools, callMcpTool } from "./api";

/**
 * MCP client section (deliverable #6). Lists configured mock/local MCP
 * servers, their tools + schemas, and lets you call one directly - the
 * same mechanism an agent run uses when an MCP tool name is included in
 * `toolAllowList`. Degrades clearly (EmptyState) if none are configured;
 * in this environment two in-process mock servers are always present, so
 * the section works with zero external setup.
 */
export function McpSection(): JSX.Element {
  const serversQuery = useQuery({ queryKey: ["mcp-servers"], queryFn: getMcpServers });
  const [selectedServer, setSelectedServer] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!selectedServer && serversQuery.data?.servers.length) {
      setSelectedServer(serversQuery.data.servers[0]!.id);
    }
  }, [serversQuery.data, selectedServer]);

  const toolsQuery = useQuery({
    queryKey: ["mcp-tools", selectedServer],
    queryFn: () => getMcpServerTools(selectedServer!),
    enabled: Boolean(selectedServer),
  });

  if (serversQuery.isLoading) return <Skeleton className="h-24 w-full" />;
  if (serversQuery.isError) {
    return <ErrorState message="Failed to load MCP servers." onRetry={() => serversQuery.refetch()} />;
  }
  const servers = serversQuery.data!.servers;
  if (servers.length === 0) {
    return (
      <EmptyState
        title="No MCP servers configured"
        description="MCP (Model Context Protocol) lets an agent discover and call tools exposed by a separate server process, instead of only using its hardcoded built-in registry. None are configured right now."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Built-in tools (calculator, web_search, ...) are hardcoded into this app's registry. MCP
        tools are discovered at runtime from an external server - the agent calls them exactly the
        same way (a <code>tool_call</code>/<code>tool_result</code> step pair), but the tool's
        implementation, and its trustworthiness, lives outside this codebase. Mock/local only in
        this environment - no real MCP server is required or contacted.
      </p>
      <div className="flex flex-wrap gap-2">
        {servers.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={selectedServer === s.id ? "default" : "secondary"}
            onClick={() => setSelectedServer(s.id)}
          >
            {s.name} <Badge variant="success" className="ml-2">{s.status}</Badge>
          </Button>
        ))}
      </div>

      {selectedServer && (
        <div className="space-y-3">
          {toolsQuery.isLoading && <Skeleton className="h-16 w-full" />}
          {toolsQuery.data?.tools.map((tool) => <McpToolCard key={tool.name} serverId={selectedServer} tool={tool} />)}
        </div>
      )}
    </div>
  );
}

function McpToolCard({ serverId, tool }: { serverId: string; tool: ToolDefinition }): JSX.Element {
  const [argsText, setArgsText] = React.useState("{}");
  const [result, setResult] = React.useState<ToolResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [calling, setCalling] = React.useState(false);

  async function call(): Promise<void> {
    setError(null);
    setResult(null);
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(argsText);
    } catch {
      setError("Arguments must be valid JSON.");
      return;
    }
    setCalling(true);
    try {
      setResult(await callMcpTool(serverId, tool.name, parsedArgs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call failed.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{tool.name}</CardTitle>
        <p className="text-xs text-muted-foreground">{tool.description}</p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Input schema</summary>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
        </details>
        <Textarea
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          rows={2}
          className="font-mono text-xs"
          aria-label={`Arguments for ${tool.name}`}
        />
        <Button size="sm" onClick={call} disabled={calling}>
          {calling ? "Calling..." : "Call tool"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <pre className={result.isError ? "rounded bg-destructive/10 p-2 text-xs" : "rounded bg-muted p-2 text-xs"}>
            {result.content}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
