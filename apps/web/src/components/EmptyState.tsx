import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Generic empty state for async surfaces with nothing to show yet (CLAUDE.md requirement). */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        // Compact and quiet, not a sad full-bleed placeholder: this renders
        // often (idle Run Inspector, idle Why This Happened, empty tabs), so
        // it should read as "nothing here yet" in one glance, not dominate
        // the pane.
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground/70" aria-hidden="true">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

/** Generic error state, surfaces `requestId` for support/debugging per docs/contracts.md §1. */
export function ErrorState({
  title = "Something went wrong",
  message,
  requestId,
  onRetry,
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <p className="font-medium text-destructive">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {requestId && (
        <p className="font-mono text-xs text-muted-foreground">Request ID: {requestId}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
