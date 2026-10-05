import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { GuardrailConfig, GuardrailFinding } from "@ail/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { StreamingRegion } from "@/components/StreamingRegion";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { DefenseLayerToggles } from "./DefenseLayerToggles";
import { getGuardrailConfig, listAttacks } from "./api";

export interface AttackPlaygroundProps {
  onRunComplete?: (runId: string) => void;
  presetAttackId?: string;
}

const ACTION_VARIANT = { block: "destructive", redact: "warning", flag: "secondary", allow: "outline" } as const;

function FindingRow({ finding }: { finding: GuardrailFinding }): JSX.Element {
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant={ACTION_VARIANT[finding.action]}>{finding.action}</Badge>
      <Badge variant="outline">{finding.severity}</Badge>
      {finding.owaspId && <Badge variant="secondary">{finding.owaspId}</Badge>}
      <span className="text-muted-foreground">{finding.message}</span>
    </li>
  );
}

/**
 * The headline M8 flow: pick an attack, run it with the current defense
 * config (default: nothing enabled -> attack succeeds), then flip layers on
 * and re-run the SAME attack to see it blocked - with the exact layer and
 * finding that stopped it called out explicitly.
 */
export function AttackPlayground({ onRunComplete, presetAttackId }: AttackPlaygroundProps): JSX.Element {
  const attacksQuery = useQuery({ queryKey: ["guardrail-attacks"], queryFn: listAttacks });
  const configQuery = useQuery({ queryKey: ["guardrail-config"], queryFn: getGuardrailConfig });

  const [attackId, setAttackId] = React.useState(presetAttackId ?? "direct-injection-reveal-secret");
  React.useEffect(() => {
    if (presetAttackId) setAttackId(presetAttackId);
  }, [presetAttackId]);

  const [config, setConfig] = React.useState<GuardrailConfig | null>(null);
  React.useEffect(() => {
    if (configQuery.data && config === null) setConfig(configQuery.data);
  }, [configQuery.data, config]);

  const sse = useSse("/api/guardrails/attack", { attackId, configOverride: config ?? undefined }, { autoStart: false });
  useRunShortcut(() => config && sse.start());

  const notifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const [id, r] of Object.entries(sse.runs)) {
      if (r.status === "complete" && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        onRunComplete?.(id);
      }
    }
  }, [sse.runs, onRunComplete]);

  const stageEvents = sse.events.filter((e) => e.type === "stage" && typeof e.stage === "string" && e.stage.startsWith("guardrail."));
  const runEntry = Object.values(sse.runs)[0];
  const run = runEntry?.run;
  const report = run?.metadata?.guardrailReport as
    | { findings: GuardrailFinding[]; blocked: boolean; redactedOutput?: string }
    | undefined;
  const attackSucceeded = run?.metadata?.attackSucceeded as boolean | undefined;
  const blockingFindings = report?.findings.filter((f) => f.action === "block") ?? [];
  const selectedAttack = attacksQuery.data?.attacks.find((a) => a.id === attackId);

  if (configQuery.isLoading || !config) {
    return <p className="text-sm text-muted-foreground">Loading guardrail config...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attack the demo bot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Contained lab - nothing here has a real effect</AlertTitle>
          <AlertDescription>
            The bot only ever talks to mock tools (no real email/filesystem/network access). The &quot;secret&quot; it
            might leak is a clearly-fake placeholder value, never a real credential.
          </AlertDescription>
        </Alert>

        <div>
          <Label htmlFor="attack-select">Attack</Label>
          <Select value={attackId} onValueChange={setAttackId}>
            <SelectTrigger id="attack-select" className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {attacksQuery.data?.attacks.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAttack && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedAttack.description} (category: {selectedAttack.category}, OWASP {selectedAttack.owaspId})
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Defense layers (toggle, then re-run the same attack)</h4>
          <DefenseLayerToggles config={config} onChange={setConfig} />
        </div>

        <Button onClick={() => sse.start()} disabled={sse.status === "connecting" || sse.status === "streaming"}>
          {sse.status === "connecting" || sse.status === "streaming" ? "Running attack..." : "Run attack (Ctrl/Cmd+Enter)"}
        </Button>

        {sse.error && <ErrorState message={sse.error.message} />}

        {attackSucceeded !== undefined && (
          <Alert variant={attackSucceeded ? "destructive" : "default"}>
            <AlertTitle>{attackSucceeded ? "Attack SUCCEEDED" : "Attack BLOCKED"}</AlertTitle>
            <AlertDescription>
              {attackSucceeded
                ? "No enabled layer stopped this attack - the bot's unsafe output reached the user unmodified. Enable more defense layers above and run the same attack again."
                : blockingFindings.length > 0
                  ? `Stopped by: ${blockingFindings.map((f) => f.layer).join(", ")}. ${blockingFindings[0]?.message ?? ""}`
                  : "The output was redacted before reaching the user."}
            </AlertDescription>
          </Alert>
        )}

        {runEntry && (
          <StreamingRegion
            text={runEntry.tokens.join("") || run?.output.text || ""}
            status={runEntry.status === "pending" ? "idle" : runEntry.status}
            label="Bot response"
          />
        )}

        {stageEvents.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Guardrail pipeline trace (which layer caught what)</h4>
            <ol className="space-y-2">
              {stageEvents.map((e, i) => {
                if (e.type !== "stage") return null;
                const data = e.data as { layer: string; findings: GuardrailFinding[] };
                return (
                  <li key={i} className="rounded-md border border-border p-2">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                      <Badge variant="outline">{i + 1}</Badge>
                      {data.layer}
                      {data.findings.length === 0 && <span className="text-xs text-muted-foreground">(allowed through)</span>}
                    </div>
                    {data.findings.length > 0 && (
                      <ul className="space-y-1 pl-2">
                        {data.findings.map((f, j) => (
                          <FindingRow key={j} finding={f} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
