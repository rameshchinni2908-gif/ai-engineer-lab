import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Progress } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { coachPrompt, type CoachResponse } from "./api";

export interface PromptCoachProps {
  onRunComplete?: (runId: string) => void;
  /** Applied from a "Try this" preset - replaces the prompt textarea's content. `!== undefined`, never truthiness. */
  appliedPrompt?: string;
}

const WEAK_PROMPT_EXAMPLE = "make this good";

/** M2 bad -> better prompt coach: heuristic score + real LLM rewrite + word-level diff. */
export function PromptCoach({ onRunComplete, appliedPrompt }: PromptCoachProps): JSX.Element {
  const [prompt, setPrompt] = React.useState(WEAK_PROMPT_EXAMPLE);

  React.useEffect(() => {
    if (appliedPrompt !== undefined) setPrompt(appliedPrompt);
  }, [appliedPrompt]);

  const mutation = useMutation({
    mutationFn: () => coachPrompt(prompt),
    onSuccess: (data: CoachResponse) => onRunComplete?.(data.metadata.runId),
  });

  const result = mutation.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bad &rarr; better prompt coach</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="coach-prompt">Your prompt</Label>
          <textarea
            id="coach-prompt"
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || prompt.trim().length === 0}>
          {mutation.isPending ? "Coaching..." : "Coach this prompt"}
        </Button>

        {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}

        {result && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Heuristic score</span>
                <Badge variant={result.score >= 70 ? "success" : result.score >= 40 ? "warning" : "destructive"}>
                  {result.score}/100
                </Badge>
              </div>
              <Progress value={result.score} />
            </div>

            {result.issues.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Issues found</h4>
                <ul className="space-y-1 text-sm">
                  {result.issues.map((issue) => (
                    <li key={issue.label} className="rounded-md border border-border p-2">
                      <span className="font-medium">{issue.label}</span>
                      <p className="text-muted-foreground">{issue.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Improved prompt</h4>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-sm">
                {result.improvedPrompt}
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Word-level diff (original &rarr; improved)</h4>
              <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm leading-relaxed">
                {result.diff.map((token, i) => {
                  if (token.op === "same") return <span key={i}>{token.text}</span>;
                  if (token.op === "remove")
                    return (
                      <span key={i} className="bg-red-200 text-red-900 line-through dark:bg-red-900/60 dark:text-red-200">
                        {token.text}
                      </span>
                    );
                  return (
                    <span key={i} className="bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                      {token.text}
                    </span>
                  );
                })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
