import type { LearningPathStep } from "@/content/types";

/** Pure: true iff every one of `step.prerequisites` is in `completedStepIds`. */
export function prerequisitesMet(step: LearningPathStep, completedStepIds: Record<string, boolean>): boolean {
  return step.prerequisites.every((id) => completedStepIds[id] === true);
}

/** Pure: 0..1 fraction of `steps` that are complete. */
export function overallCompletion(steps: LearningPathStep[], completedStepIds: Record<string, boolean>): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => completedStepIds[s.id] === true).length;
  return done / steps.length;
}

/** Pure: validates every step's prerequisites resolve to a real step id in the same list (defensive check against authoring errors). */
export function validatePrerequisitesResolve(steps: LearningPathStep[]): string[] {
  const ids = new Set(steps.map((s) => s.id));
  const problems: string[] = [];
  for (const step of steps) {
    for (const prereq of step.prerequisites) {
      if (!ids.has(prereq)) problems.push(`${step.id} references unknown prerequisite "${prereq}"`);
    }
  }
  return problems;
}
