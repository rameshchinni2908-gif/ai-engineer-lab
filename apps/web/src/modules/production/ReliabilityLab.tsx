import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Copy } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Label,
  Input,
  Badge,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { productionApi, type ReliabilityScenario, type ReliabilitySimResult } from "./api";

const SCENARIO_LABELS: Record<ReliabilityScenario, string> = {
  timeout: "Timeout (retry + backoff)",
  "provider-down": "Provider down (circuit breaker + fallback)",
  "rate-limited": "Rate limited (backoff)",
  "duplicate-request": "Duplicate request (idempotency)",
  "queue-backpressure": "Queue backpressure (queueing)",
};

const OUTCOME_ICON: Record<ReliabilitySimResult["attempts"][number]["outcome"], JSX.Element> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />,
  fail: <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />,
  deduplicated: <Copy className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />,
  queued: <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
};

/**
 * M9 Reliability Lab: all 6 CLAUDE.md reliability levers (retry/backoff,
 * timeouts, provider fallback, circuit breaker, idempotency, queues) via
 * `/production/reliability-sim`'s 5 deterministic, synthetic-failure
 * scenarios. Toggling the relevant policy control off reproduces the
 * documented "failure visible" state for each lever.
 */
export function ReliabilityLab(): JSX.Element {
  const [scenario, setScenario] = React.useState<ReliabilityScenario>("timeout");
  const [maxRetries, setMaxRetries] = React.useState(0);
  const [backoffMs, setBackoffMs] = React.useState(200);
  const [useFallback, setUseFallback] = React.useState(false);
  const [breakerThreshold, setBreakerThreshold] = React.useState<number | undefined>(undefined);
  const [idempotencyKey, setIdempotencyKey] = React.useState("order-42-refund");
  const [queueConcurrency, setQueueConcurrency] = React.useState(1);

  const mutation = useMutation({
    mutationFn: () =>
      productionApi.reliabilitySim({
        scenario,
        policy: {
          maxRetries,
          backoffMs,
          fallbackProviderId: useFallback ? "mock" : undefined,
          circuitBreakerThreshold: breakerThreshold,
          idempotencyKey: scenario === "duplicate-request" ? idempotencyKey : undefined,
          queueConcurrency,
        },
      }),
  });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="reliability-scenario-select" className="mb-1 block text-xs font-medium">Scenario</label>
        <Select value={scenario} onValueChange={(v) => setScenario(v as ReliabilityScenario)}>
          <SelectTrigger id="reliability-scenario-select" className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SCENARIO_LABELS).map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="maxRetries">
            Max <GlossaryTerm id="retry-with-backoff">retries</GlossaryTerm> (0 = policy &quot;off&quot;)
          </Label>
          <Input
            id="maxRetries"
            type="number"
            min={0}
            max={10}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="backoffMs">Backoff (ms)</Label>
          <Input
            id="backoffMs"
            type="number"
            min={0}
            value={backoffMs}
            onChange={(e) => setBackoffMs(Number(e.target.value))}
          />
        </div>

        {scenario === "provider-down" && (
          <>
            <div className="flex items-center gap-2">
              <Switch id="fallback" checked={useFallback} onCheckedChange={setUseFallback} />
              <Label htmlFor="fallback">Provider fallback configured</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="breaker">
                <GlossaryTerm id="circuit-breaker">Circuit breaker</GlossaryTerm> threshold (blank = disabled)
              </Label>
              <Input
                id="breaker"
                type="number"
                min={1}
                value={breakerThreshold ?? ""}
                onChange={(e) => setBreakerThreshold(e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </div>
          </>
        )}

        {scenario === "duplicate-request" && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="idemKey">
              <GlossaryTerm id="idempotency-key">Idempotency key</GlossaryTerm>
            </Label>
            <Input id="idemKey" value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} />
          </div>
        )}

        {scenario === "queue-backpressure" && (
          <div className="space-y-1">
            <Label htmlFor="concurrency">
              <GlossaryTerm id="queueing">Queue concurrency</GlossaryTerm> (1 = policy &quot;off&quot;)
            </Label>
            <Input
              id="concurrency"
              type="number"
              min={1}
              max={10}
              value={queueConcurrency}
              onChange={(e) => setQueueConcurrency(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Simulating..." : "Run reliability sim"}
      </Button>

      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && <ReliabilityResult result={mutation.data} />}

      <p className="text-xs text-muted-foreground">
        Pure, deterministic, synthetic-failure simulation - no real provider calls are made for
        this lab, so it is free and reproducible (per contracts.md §4 M9).
      </p>
    </div>
  );
}

function ReliabilityResult({ result }: { result: ReliabilitySimResult }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Attempt timeline
          <Badge variant={result.finalOutcome === "success" ? "default" : "destructive"}>
            {result.finalOutcome}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <ol className="space-y-1">
          {result.attempts.map((a) => (
            <li key={a.attempt} className="flex items-center gap-2">
              {OUTCOME_ICON[a.outcome]}
              <span>Attempt {a.attempt}: {a.outcome}</span>
              <span className="text-xs text-muted-foreground">({a.latencyMs}ms)</span>
            </li>
          ))}
        </ol>
        <div className="text-xs text-muted-foreground">
          Total latency: {result.totalLatencyMs}ms
          {result.idempotencyKey && <> · key: <code>{result.idempotencyKey}</code></>}
        </div>
        {result.queueDepthOverTime && (
          <div>
            <div className="mb-1 text-xs font-medium">Queue depth over time</div>
            <div className="flex items-end gap-1" aria-hidden="true">
              {result.queueDepthOverTime.map((d, i) => (
                <div key={i} className="w-4 bg-primary/60" style={{ height: `${Math.max(d, 1) * 6}px` }} />
              ))}
            </div>
            <span className="sr-only">
              Queue depth samples: {result.queueDepthOverTime.join(", ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
