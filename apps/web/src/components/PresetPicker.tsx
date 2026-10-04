import type { PresetCopy } from "@/content/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
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
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {presets.map((preset) => (
        <Card
          key={preset.id}
          className={cn(
            "transition-colors",
            activeId === preset.id && "border-primary ring-1 ring-primary",
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{preset.label}</CardTitle>
            <CardDescription>{preset.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button size="sm" variant={activeId === preset.id ? "default" : "secondary"} onClick={() => onSelect(preset)}>
              Try this
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
