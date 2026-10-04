import type { Difficulty } from "@ail/shared";
import { useDifficulty } from "@/hooks/useDifficulty";
import { cn } from "@/lib/utils";

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "senior", label: "Senior" },
];

export interface DifficultyToggleProps {
  className?: string;
}

/**
 * Beginner / Intermediate / Senior segmented control, backed by
 * `useDifficulty()`. Mount anywhere (header, module page); all instances
 * stay in sync via the shared context/store.
 */
export function DifficultyToggle({ className }: DifficultyToggleProps): JSX.Element {
  const { difficulty, setDifficulty } = useDifficulty();

  return (
    <div
      role="radiogroup"
      aria-label="Content difficulty"
      className={cn("inline-flex rounded-md border border-border bg-muted p-1", className)}
    >
      {LEVELS.map((level) => {
        const active = difficulty === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setDifficulty(level.value)}
            className={cn(
              "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
