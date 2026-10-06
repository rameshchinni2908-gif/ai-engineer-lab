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

/** Params a preset (or any other caller) can apply. `config`, if present, is user/preset INTENT and always wins over whatever `GET /guardrails/config` returns - see the precedence rule on `userInteractedRef` below. */
export interface AttackPlaygroundParams {
  attackId?: string;
  config?: GuardrailConfig;
}

export interface AttackPlaygroundProps {
  onRunComplete?: (runId: string) => void;
  appliedParams?: AttackPlaygroundParams;
}

const ACTION_VARIANT = { block: "destructive", redact: "warning", flag: "secondary", allow: "outline" } as const;

/** Local starting point so the playground is immediately usable even if the `GET /guardrails/config` fetch is slow/unavailable - mirrors the backend's own undefended default (everything off, every tool allowed). */
export const FALLBACK_CONFIG: GuardrailConfig = {
  inputValidation: false,
  piiRedaction: false,
  injectionClassifier: false,
  instructionHierarchy: false,
  delimiterHardening: false,
  outputModeration: false,
  schemaEnforcement: false,
  toolAllowList: ["send_email", "read_file", "execute_code", "web_search"],
  leastPrivilege: false,
  sandbox: false,
  rateLimit: false,
  approvalGates: false,
};

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
export function AttackPlayground({ onRunComplete, appliedParams }: AttackPlaygroundProps): JSX.Element {
  const attacksQuery = useQuery({ queryKey: ["guardrail-attacks"], queryFn: listAttacks });
  const configQuery = useQuery({ queryKey: ["guardrail-config"], queryFn: getGuardrailConfig });

  const [attackId, setAttackId] = React.useState(appliedParams?.attackId ?? "direct-injection-reveal-secret");

  /**
   * State-precedence rule (the race this fixes): `userInteractedRef` flips
   * to `true` the FIRST time the config is set by anything that represents
   * explicit intent - the user toggling a layer by hand, OR a preset being
   * applied (a preset click is user intent too, just expressed in one click
   * instead of twelve). Once it's `true`, the `GET /guardrails/config`
   * effect below is permanently inert for the rest of this component's
   * life: a slow/late-arriving server response can only ever SEED the
   * initial value, never overwrite something the user already chose. This
   * ordering is explicit (one ref, one guard, checked in both places that
   * write `config`) rather than incidental.
   */
  const userInteractedRef = React.useRef(Boolean(appliedParams?.config));
  const [config, setConfig] = React.useState<GuardrailConfig>(appliedParams?.config ?? FALLBACK_CONFIG);

  React.useEffect(() => {
    if (configQuery.data && !userInteractedRef.current) {
      setConfig(configQuery.data);
    }
  }, [configQuery.data]);

  // Presets re-apply on every distinct `appliedParams` object (not just
  // mount), so clicking a preset again - or a different preset - always
  // takes effect, and always wins over the server fetch from here on.
  React.useEffect(() => {
    if (!appliedParams) return;
    if (appliedParams.attackId !== undefined) setAttackId(appliedParams.attackId);
    if (appliedParams.config !== undefined) {
      userInteractedRef.current = true;
      setConfig(appliedParams.config);
    }
  }, [appliedParams]);

  function handleConfigChange(next: GuardrailConfig): void {
    userInteractedRef.current = true;
    setConfig(next);
  }

  const sse = useSse("/api/guardrails/attack", { attackId, configOverride: config }, { autoStart: false });
  useRunShortcut(() => sse.start());

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

        <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
          Simulated, for intuition only - the bot&apos;s response below is a deterministic
          SCRIPTED string (<code>buildUndefendedOutput</code>), not a live LLM call to any
          provider, including a real one. This is intentional: it makes which guardrail layer
          catches what 100% reproducible for teaching, but it means you are NOT watching a real
          model get jailbroken - you&apos;re watching a scripted teaching harness whose scripted
          reply is deliberately unsafe until a guardrail layer blocks/redacts it.
        </p>

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
          <DefenseLayerToggles config={config} onChange={handleConfigChange} />
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
