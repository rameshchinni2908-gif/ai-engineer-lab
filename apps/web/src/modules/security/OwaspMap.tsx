import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getOwaspMap } from "./api";

/** OWASP LLM Top 10, with the attack(s) this module demos for each category. */
export function OwaspMap(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ["guardrail-owasp-map"], queryFn: getOwaspMap });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>OWASP LLM Top 10</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data?.mappings.map((m) => (
          <div key={m.owaspId} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
            <Badge variant="outline">{m.owaspId}</Badge>
            <span className="font-medium">{m.title}</span>
            {m.attackIds.length > 0 ? (
              <Badge variant="secondary">{m.attackIds.length} demo(s) in this module</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">(not demoed in this module)</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
