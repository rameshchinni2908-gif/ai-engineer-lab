import { Lock, CheckCircle2, Circle } from "lucide-react";
import { LEARNING_PATH } from "@/content";
import { Progress, Badge } from "@/components/ui";
import { useLearningPathStore } from "./learningPathStore";
import { prerequisitesMet, overallCompletion } from "./learningPathLogic";

/**
 * M11 guided learning path: renders `LEARNING_PATH` (13 steps) in order,
 * enforces/indicates prerequisites, and persists per-step completion via
 * this module's own small persisted store (`learningPathStore.ts`).
 */
export function LearningPath(): JSX.Element {
  const completedStepIds = useLearningPathStore((s) => s.completedStepIds);
  const toggleStep = useLearningPathStore((s) => s.toggleStep);

  const sorted = [...LEARNING_PATH].sort((a, b) => a.order - b.order);
  const completion = overallCompletion(LEARNING_PATH, completedStepIds);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">Overall progress</span>
          <span className="text-muted-foreground">{Math.round(completion * 100)}%</span>
        </div>
        <Progress value={completion * 100} aria-label="Learning path overall completion" />
      </div>

      <ol className="space-y-2">
        {sorted.map((step) => {
          const unlocked = prerequisitesMet(step, completedStepIds);
          const done = completedStepIds[step.id] === true;
          return (
            <li key={step.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => toggleStep(step.id, !done)}
                  aria-pressed={done}
                  aria-label={done ? `Mark "${step.title}" incomplete` : `Mark "${step.title}" complete`}
                  className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : unlocked ? (
                    <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {step.order}. {step.title}
                    </span>
                    <Badge variant="outline">{step.moduleId}</Badge>
                    <span className="text-xs text-muted-foreground">~{step.estimatedMinutes} min</span>
                    {!unlocked && (
                      <span className="text-xs text-muted-foreground">
                        Locked - requires: {step.prerequisites.map((id) => LEARNING_PATH.find((s) => s.id === id)?.title ?? id).join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{step.goal}</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {step.checkpoints.map((cp, i) => (
                      <li key={i}>{cp}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
