import * as React from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export type StreamingRegionStatus = "idle" | "streaming" | "complete" | "error";

export interface StreamingRegionProps {
  /** The accumulated streamed text so far (e.g. `runs[id].tokens.join("")` from `useSse`). */
  text: string;
  /** Drives `aria-busy`, the pulsing cursor, and the completion/failure announcement. */
  status: StreamingRegionStatus;
  /** Exact token count for the completion summary. Falls back to a whitespace-split estimate of `text`. */
  tokenCount?: number;
  /** Prefixes the completion/progress announcement, e.g. "Generation" -> "Generation complete, 142 tokens." */
  label?: string;
  className?: string;
  /** Override the visible rendering (default: `text` in a `whitespace-pre-wrap` block). The live-region announcement logic is unaffected. */
  children?: React.ReactNode;
}

/** How often (ms) to push a new "still generating" announcement while streaming, so screen readers get periodic progress instead of silence OR a reflow on every single token. */
const PROGRESS_ANNOUNCE_THROTTLE_MS = 2000;

function pluralTokens(n: number): string {
  return `${n} token${n === 1 ? "" : "s"}`;
}

/**
 * **Required** wrapper for any streaming token output (CLAUDE.md WCAG AA).
 * Screen readers get a separate, visually-hidden `role="status"` live region
 * that is throttled to periodic progress updates plus one completion/failure
 * summary - never a re-announcement of the full growing buffer on every
 * token, which is unusable with assistive tech. Sighted users see the full
 * text update live in the visible (non-live-region) block.
 *
 * Module agents: use this instead of rendering raw streamed text anywhere a
 * user might be listening with a screen reader. See docs/component-api.md
 * §9a for the required usage pattern - do not roll your own `aria-live`.
 */
export function StreamingRegion({
  text,
  status,
  tokenCount,
  label = "Generation",
  className,
  children,
}: StreamingRegionProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const [announcement, setAnnouncement] = React.useState("");
  const lastAnnouncedAtRef = React.useRef(0);
  const timerRef = React.useRef<number | undefined>(undefined);

  const estimatedTokens = React.useMemo(
    () => tokenCount ?? (text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length),
    [tokenCount, text],
  );

  React.useEffect(() => {
    window.clearTimeout(timerRef.current);

    if (status === "idle") {
      setAnnouncement("");
      return;
    }
    if (status === "complete") {
      setAnnouncement(`${label} complete, ${pluralTokens(estimatedTokens)}.`);
      return;
    }
    if (status === "error") {
      setAnnouncement(`${label} failed.`);
      return;
    }

    // status === "streaming": throttle so we announce progress periodically,
    // not on every token (which would spam/garble a screen reader).
    const now = Date.now();
    const elapsed = now - lastAnnouncedAtRef.current;
    const announceProgress = (): void => {
      lastAnnouncedAtRef.current = Date.now();
      setAnnouncement(`${label} in progress, ${pluralTokens(estimatedTokens)} so far.`);
    };

    if (elapsed >= PROGRESS_ANNOUNCE_THROTTLE_MS) {
      announceProgress();
    } else {
      timerRef.current = window.setTimeout(announceProgress, PROGRESS_ANNOUNCE_THROTTLE_MS - elapsed);
    }

    return () => window.clearTimeout(timerRef.current);
  }, [status, estimatedTokens, label]);

  return (
    <div className={cn("relative", className)} aria-busy={status === "streaming"}>
      {/* Visible output: sighted users watch this update live. Marked aria-hidden
          because the separate throttled live region below is what assistive
          tech should hear - re-exposing this too would double-announce. */}
      <div aria-hidden="true" className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
        {children ?? text}
        {status === "streaming" && (
          <span
            aria-hidden="true"
            className={cn("ml-0.5 inline-block w-2 translate-y-0.5 bg-foreground/70", !reducedMotion && "animate-pulse")}
          >
            {" "}
          </span>
        )}
      </div>

      {/* Visually hidden, screen-reader-only progress/completion announcer. */}
      <div role="status" aria-live="polite" aria-atomic="false" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
