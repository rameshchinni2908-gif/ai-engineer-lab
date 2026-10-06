import type { PresetCopy } from "@/content/types";
import { Button, Card } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export interface PresetPickerProps<T> {
  /** Copy (label/description) owned by `content-writer`, >= 3 per module per CLAUDE.md. */
  presets: (PresetCopy & { params?: T })[];
  onSelect: (preset: PresetCopy & { params?: T }) => void;
  activeId?: string;
  className?: string;
}

/**
 * Renders a module's "Try this" presets. The module agent supplies
 * `presets` (copy from `@/content` zipped with that module's own params
 * shape `T`) and an `onSelect` handler that applies those params to its
 * playground form/state. This component never knows about any module's
 * param shape - keep `T` generic at the call site.
 */
export function PresetPicker<T>({ presets, onSelect, activeId, className }: PresetPickerProps<T>): JSX.Element {
  if (presets.length === 0) {
    return (
      <EmptyState
        title="No presets yet"
        description="This module hasn't registered any 'Try this' presets."
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        // Vertically stacked compact rows, not a column grid or a horizontal
        // rail: this component renders inside ModuleShell's narrow center
        // column (~280-400px in practice). A viewport-breakpoint grid
        // (`sm:`/`lg:grid-cols-N`) measures against the window, not the
        // container, so it produced unreadable slivers; a horizontal scroll
        // rail fit the same too-narrow-track problem from the other axis -
        // cards got sliced mid-word at the column edge with no affordance.
        // A single-column list of one-line rows has no column-count decision
        // to get wrong and degrades gracefully at any container width.
        "flex flex-col gap-2",
        className,
      )}
    >
      {presets.map((preset) => {
        const active = activeId === preset.id;
        return (
          <Card
            key={preset.id}
            className={cn(
              "flex min-w-0 items-center gap-3 p-3 transition-shadow hover:shadow-sm",
              active ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <div className="min-w-0 flex-1">
              {/* Must stay a heading (role=heading) - module smoke tests find
                  a given preset's row via `getByRole("heading", { name: ... })`. */}
              <h3 className="truncate text-sm font-semibold leading-none tracking-tight">{preset.label}</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">{preset.description}</p>
            </div>
            <Button
              size="sm"
              variant={active ? "default" : "secondary"}
              className="shrink-0"
              onClick={() => onSelect(preset)}
            >
              Try this
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
