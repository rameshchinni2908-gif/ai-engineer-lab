import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import {
  runJudgeCalibration,
  runPositionBiasDemo,
  runSelfEnhancementBiasDemo,
  runVerbosityBiasDemo,
} from "./api";

/** M7 judge-bias education + calibration lab: runnable before/after examples for position, verbosity, and self-enhancement bias, plus human-label calibration. */
export function JudgeBiasLab(): JSX.Element {
  const positionMutation = useMutation({ mutationFn: runPositionBiasDemo });
  const verbosityMutation = useMutation({
    mutationFn: () =>
      runVerbosityBiasDemo(
        "Paris.",
        "Well, after carefully considering all the historical and geographical context, the correct answer is clearly Paris, the capital city of France.",
      ),
  });
  const selfEnhancementMutation = useMutation({
    mutationFn: () => runSelfEnhancementBiasDemo("anthropic", "anthropic"),
  });

  const [calibrationInput, setCalibrationInput] = React.useState(
    '[{"caseId":"c1","humanScore":0.9,"judgeScore":0.85},{"caseId":"c2","humanScore":0.2,"judgeScore":0.6}]',
  );
  const calibrationMutation = useMutation({
    mutationFn: () => runJudgeCalibration(JSON.parse(calibrationInput)),
  });

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
        Simulated, for intuition only - these three demos are deterministic offline
        simulations of documented bias patterns (position, verbosity, self-enhancement), not
        bias measured from a live provider call. They illustrate what each bias LOOKS like and
        why the standard mitigation (order-swapping, length normalization, third-party judges)
        works, never a real judge model&apos;s actual behavior.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Position bias: before vs. after order-swap mitigation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Runs the same pairwise comparison twice with the responses swapped. If the judge just tracks slot position
            instead of content, the two runs will disagree on which underlying response actually won.
          </p>
          <Button size="sm" onClick={() => positionMutation.mutate()} disabled={positionMutation.isPending}>
            {positionMutation.isPending ? "Running..." : "Run demo"}
          </Button>
          {positionMutation.data && (
            <div className="rounded-md border border-border p-2 text-sm">
              <p>Forward: winner {positionMutation.data.forward.winner}</p>
              <p>Swapped: winner {positionMutation.data.swapped.winner}</p>
              <p className="font-medium">{positionMutation.data.biasDetected ? "Bias detected" : "No bias detected"}</p>
              <p className="text-xs text-muted-foreground">{positionMutation.data.explanation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verbosity bias: naive vs. length-normalized scoring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Compares a terse, fully correct answer against a much longer, padded one. A naive scorer that rewards length
            rates the padded answer higher purely for being longer.
          </p>
          <Button size="sm" onClick={() => verbosityMutation.mutate()} disabled={verbosityMutation.isPending}>
            {verbosityMutation.isPending ? "Running..." : "Run demo"}
          </Button>
          {verbosityMutation.data && (
            <div className="rounded-md border border-border p-2 text-sm">
              <p>Naive score: {verbosityMutation.data.naiveScore.toFixed(2)}</p>
              <p>Length-normalized score: {verbosityMutation.data.lengthNormalizedScore.toFixed(2)}</p>
              <p className="font-medium">{verbosityMutation.data.biasDetected ? "Bias detected" : "No bias detected"}</p>
              <p className="text-xs text-muted-foreground">{verbosityMutation.data.explanation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Self-enhancement bias: same-family judge vs. third-party judge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Compares a judge scoring a candidate from its OWN provider family against an unrelated third-party judge
            scoring the same quality of output.
          </p>
          <Button size="sm" onClick={() => selfEnhancementMutation.mutate()} disabled={selfEnhancementMutation.isPending}>
            {selfEnhancementMutation.isPending ? "Running..." : "Run demo (anthropic judging anthropic)"}
          </Button>
          {selfEnhancementMutation.data && (
            <div className="rounded-md border border-border p-2 text-sm">
              <p>Same-family score: {selfEnhancementMutation.data.sameFamilyScore.toFixed(2)}</p>
              <p>Third-party score: {selfEnhancementMutation.data.thirdPartyJudgeScore.toFixed(2)}</p>
              <p className="font-medium">{selfEnhancementMutation.data.biasDetected ? "Bias detected" : "No bias detected"}</p>
              <p className="text-xs text-muted-foreground">{selfEnhancementMutation.data.explanation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calibrate the judge against human-labelled cases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Paste <code>{"{ caseId, humanScore, judgeScore }"}</code> pairs (0..1) to measure how often the judge agrees
            with a human reviewer before trusting it to gate deploys.
          </p>
          <Label htmlFor="calibration-input">Labelled cases (JSON array)</Label>
          <Textarea id="calibration-input" rows={4} value={calibrationInput} onChange={(e) => setCalibrationInput(e.target.value)} className="font-mono text-xs" />
          <Button
            size="sm"
            onClick={() => calibrationMutation.mutate()}
            disabled={calibrationMutation.isPending}
          >
            {calibrationMutation.isPending ? "Calibrating..." : "Calibrate"}
          </Button>
          {calibrationMutation.isError && <ErrorState message={(calibrationMutation.error as Error).message} />}
          {calibrationMutation.data && (
            <div className="rounded-md border border-border p-2 text-sm">
              <p>Agreement rate: {(calibrationMutation.data.agreementRate * 100).toFixed(0)}%</p>
              <p>Mean absolute error: {calibrationMutation.data.meanAbsoluteError.toFixed(3)}</p>
              <p>Correlation: {calibrationMutation.data.correlation.toFixed(3)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
