import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import type { ModuleId } from "@ail/shared";
import { MODULE_CONTENT } from "@/content";
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
  Badge,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { checklistApi, type QuizSubmitResult } from "./api";

const MODULE_IDS: ModuleId[] = [
  "fundamentals", "prompting", "structured", "embeddings", "rag",
  "agents", "evals", "security", "production", "advanced", "checklist",
];

/**
 * M11 quizzes: renders `MODULE_CONTENT[moduleId].quiz` (5 questions per
 * module, all 11 modules selectable) with scoring via
 * `POST /checklist/quiz/:quizId/submit`, per-question explanations, and a
 * retry that clears answers without resetting the module choice.
 */
export function Quiz(): JSX.Element {
  const [moduleId, setModuleId] = React.useState<ModuleId>("production");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<QuizSubmitResult | null>(null);

  const quiz = MODULE_CONTENT[moduleId].quiz;

  const mutation = useMutation({
    mutationFn: () => checklistApi.submitQuiz(moduleId, answers),
    onSuccess: setResult,
  });

  function selectModule(id: ModuleId): void {
    setModuleId(id);
    setAnswers({});
    setResult(null);
  }

  function retry(): void {
    setAnswers({});
    setResult(null);
  }

  const allAnswered = quiz.every((q) => answers[q.id] !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="quiz-module-select" className="mb-1 block text-xs font-medium">Module quiz</label>
          <Select value={moduleId} onValueChange={(v) => selectModule(v as ModuleId)}>
            <SelectTrigger id="quiz-module-select" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODULE_IDS.map((id) => (
                <SelectItem key={id} value={id}>{id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {result && (
          <Badge variant={result.score >= 0.8 ? "success" : result.score >= 0.5 ? "warning" : "destructive"}>
            Score: {Math.round(result.score * 100)}%
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        {quiz.map((q, qi) => {
          const isCorrect = result?.correct[q.id];
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {qi + 1}. {q.question}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <fieldset>
                  <legend className="sr-only">{q.question}</legend>
                  {q.options.map((opt, oi) => {
                    const inputId = `${q.id}-opt-${oi}`;
                    return (
                      <div key={oi} className="flex items-center gap-2 py-0.5">
                        <input
                          id={inputId}
                          type="radio"
                          name={q.id}
                          value={String(oi)}
                          checked={answers[q.id] === String(oi)}
                          disabled={!!result}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: String(oi) }))}
                          className="h-4 w-4"
                        />
                        <label htmlFor={inputId} className="text-sm">{opt}</label>
                      </div>
                    );
                  })}
                </fieldset>
                {result && (
                  <p className={isCorrect ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-destructive"}>
                    {isCorrect ? "Correct. " : "Not quite. "}
                    {result.explanations[q.id]}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}

      <div className="flex gap-2">
        {!result ? (
          <Button onClick={() => mutation.mutate()} disabled={!allAnswered || mutation.isPending}>
            {mutation.isPending ? "Scoring..." : "Submit answers"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={retry}>Retry this quiz</Button>
        )}
      </div>
    </div>
  );
}
