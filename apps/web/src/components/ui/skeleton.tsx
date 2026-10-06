import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Uses `motion-reduce:animate-none` so
 * `prefers-reduced-motion` users don't get the pulse animation (CLAUDE.md a11y).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none [animation-duration:1.6s]",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
