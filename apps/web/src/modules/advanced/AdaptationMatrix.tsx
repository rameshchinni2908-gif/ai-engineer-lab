import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Badge,
} from "@/components/ui";
import {
  scoreAdaptationTechniques,
  type AdaptationInputs,
  type DataVolume,
  type LatencyBudget,
  type CostCeiling,
  type DriftRate,
} from "./adaptationScoring";

const DEFAULTS: AdaptationInputs = {
  dataVolume: "small",
  latencyBudget: "moderate",
  costCeiling: "medium",
  driftRate: "occasional",
};

/**
 * M10 adaptation decision matrix: prompting vs. RAG vs. fine-tune vs. LoRA
 * vs. distillation, scored live on the user's own 4 inputs with a traceable
 * recommendation (see `adaptationScoring.ts`). Pure client-side computation
 * per contracts.md §4 M10 - this is a decision framework, not an API call.
 */
export function AdaptationMatrix(): JSX.Element {
  const [inputs, setInputs] = React.useState<AdaptationInputs>(DEFAULTS);
  const result = React.useMemo(() => scoreAdaptationTechniques(inputs), [inputs]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Adaptation decision matrix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="data-volume">Data volume</Label>
            <Select value={inputs.dataVolume} onValueChange={(v) => setInputs((p) => ({ ...p, dataVolume: v as DataVolume }))}>
              <SelectTrigger id="data-volume"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (a handful of examples)</SelectItem>
                <SelectItem value="medium">Medium (hundreds)</SelectItem>
                <SelectItem value="large">Large (thousands+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="latency-budget">Latency budget</Label>
            <Select value={inputs.latencyBudget} onValueChange={(v) => setInputs((p) => ({ ...p, latencyBudget: v as LatencyBudget }))}>
              <SelectTrigger id="latency-budget"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tight">Tight</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="relaxed">Relaxed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cost-ceiling">Cost ceiling</Label>
            <Select value={inputs.costCeiling} onValueChange={(v) => setInputs((p) => ({ ...p, costCeiling: v as CostCeiling }))}>
              <SelectTrigger id="cost-ceiling"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="drift-rate">Knowledge drift rate</Label>
            <Select value={inputs.driftRate} onValueChange={(v) => setInputs((p) => ({ ...p, driftRate: v as DriftRate }))}>
              <SelectTrigger id="drift-rate"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="occasional">Occasional</SelectItem>
                <SelectItem value="frequent">Frequent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <Badge>{result.recommended}</Badge>
          <p className="mt-1 text-sm">{result.rationale}</p>
        </div>

        <ul className="space-y-1 text-sm">
          {result.scores.map((s) => (
            <li key={s.technique} className="flex items-center gap-2">
              <span className="w-24 font-medium">{s.technique}</span>
              <span className="text-xs text-muted-foreground">score {s.score}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          This narrows the search space based on your stated constraints - it is a starting
          hypothesis to validate against your actual project, not a replacement for judgment.
        </p>
      </CardContent>
    </Card>
  );
}
