import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Slider, Label } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";

type Stage = "pin" | "shadow" | "canary" | "full" | "deprecate";

const STAGES: { id: Stage; label: string; description: string }[] = [
  {
    id: "pin",
    label: "1. Pin the current model/version",
    description:
      "Every run records the exact model id used (never \"latest\") so a provider-side model update can't silently change behavior underneath you.",
  },
  {
    id: "shadow",
    label: "2. Shadow the new version",
    description:
      "Run the candidate alongside production on real traffic, compare outputs, but never show the candidate's output to a real user. Zero user-facing risk, but can't observe real user reaction.",
  },
  {
    id: "canary",
    label: "3. Canary with a traffic split",
    description:
      "Route a small, real percentage of live traffic to the candidate and monitor quality/cost/latency before a full rollout. Real (small) risk, but the only way to get genuine user-facing signal.",
  },
  {
    id: "full",
    label: "4. Full rollout",
    description: "Once canary metrics hold up, shift 100% of traffic to the new pinned version.",
  },
  {
    id: "deprecate",
    label: "5. Deprecation playbook for the old version",
    description:
      "Announce a sunset date, keep the old version callable (pinned) during a grace period for anyone still depending on it, monitor for stragglers, then remove it.",
  },
];

/**
 * M9 versioning/rollout: pinning, shadow, canary (with a traffic-split
 * slider), and a deprecation playbook. Static educational content
 * (content-writer's learn/pitfalls already covers the reasoning) made
 * interactive here as a client-side-only stepper + traffic-split
 * calculator - no backend route exists for this per contracts.md §4 M9
 * ("there is no live traffic to shadow or canary against in this app").
 */
export function RolloutPlaybook(): JSX.Element {
  const [stage, setStage] = React.useState<Stage>("pin");
  const [canaryPct, setCanaryPct] = React.useState([5]);
  const active = STAGES.find((s) => s.id === stage)!;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Model <GlossaryTerm id="canary-deployment">versioning &amp; rollout</GlossaryTerm> playbook
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStage(s.id)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              <Badge variant={stage === s.id ? "default" : "outline"}>{s.label}</Badge>
            </button>
          ))}
        </div>
        <p className="text-sm">{active.description}</p>

        {stage === "canary" && (
          <div className="space-y-2">
            <Label htmlFor="canary-pct">Canary traffic split: {canaryPct[0]}% to the candidate</Label>
            <Slider
              id="canary-pct"
              min={1}
              max={50}
              step={1}
              value={canaryPct}
              onValueChange={setCanaryPct}
              aria-label="Canary traffic percentage"
            />
            <p className="text-xs text-muted-foreground">
              Lower % = less user-facing risk if the candidate regresses, but slower to reach
              statistically meaningful signal. Higher % gets signal faster at higher blast-radius
              if something is wrong - there is no single correct number, it is a risk/speed trade-off.
            </p>
          </div>
        )}

        {stage === "shadow" && (
          <p className="text-xs text-muted-foreground">
            <GlossaryTerm id="shadow-deployment">Shadow deployment</GlossaryTerm> is a pre-canary
            check, not a substitute for canarying - it cannot observe real user reaction since no
            user ever sees the shadow's output.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
