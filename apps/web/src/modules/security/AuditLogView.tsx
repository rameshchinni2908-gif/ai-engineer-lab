import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { getAuditLog } from "./api";

/** Read-only audit trail: every guardrail finding + config change, per contracts §4 M8. */
export function AuditLogView(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ["guardrail-audit-log"], queryFn: () => getAuditLog({ pageSize: 30 }) });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No audit entries yet" description="Run an attack or change the guardrail config to populate this log." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 space-y-2 overflow-y-auto">
        {data.items.map((e) => (
          <div key={e.id} className="rounded-md border border-border p-2 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{e.action}</Badge>
              <span className="text-muted-foreground">{e.resourceType}</span>
              {e.resourceId && <span className="font-mono">{e.resourceId}</span>}
              <span className="ml-auto text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">{JSON.stringify(e.details)}</pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
