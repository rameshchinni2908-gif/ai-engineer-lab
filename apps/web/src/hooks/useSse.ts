import { useCallback, useEffect, useRef, useState } from "react";
import { SseEventSchema, type Run, type SseEvent } from "@ail/shared";
import { SseFrameParser } from "@/lib/sse-parser";

/**
 * Connection-level status. `"aborted"` and the others beyond the
 * `{events, runs, status, error, abort}` surface named in docs/contracts.md
 * §6 are additive - callers that only destructure those five fields are
 * unaffected.
 */
export type SseStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "aborted";

export type RunStreamStatus = "pending" | "streaming" | "complete" | "error";

export interface SseClientError {
  code: string;
  message: string;
}

/** Per-`runId` demultiplexed state - what a single logical run looks like mid-stream. */
export interface RunStreamState {
  runId: string;
  status: RunStreamStatus;
  /** Ordered `token` event text, concatenated for convenience (`tokens.join("")`). */
  tokens: string[];
  /** Every event seen for this runId, in arrival order. */
  events: SseEvent[];
  /** Populated once `run_complete` arrives. */
  run?: Run;
  error?: SseClientError;
}

export interface UseSseResult {
  /** Every event seen on the connection, across all runIds, in arrival order. */
  events: SseEvent[];
  /** Demultiplexed per-runId state - keyed by `SseEvent.runId`. */
  runs: Record<string, RunStreamState>;
  status: SseStatus;
  /** Connection-level error (e.g. initial non-2xx, or close-without-`done`). `null` while healthy. */
  error: SseClientError | null;
  /** Abort the in-flight request (if any) and mark the connection `"aborted"`. */
  abort: () => void;
  /** Manually (re)start the request. No-op if `url` is `null` or a request is already in flight. */
  start: () => void;
}

export interface UseSseOptions {
  /** Fire the POST immediately on mount (and whenever `url` changes). Default `false`. */
  autoStart?: boolean;
  /** Called for every parsed event, in addition to the internal state update - for imperative side effects. */
  onEvent?: (event: SseEvent) => void;
  /** Extra request headers to merge in. `Content-Type` and `Accept` are set automatically. */
  headers?: Record<string, string>;
}

function emptyRun(runId: string): RunStreamState {
  return { runId, status: "pending", tokens: [], events: [] };
}

/**
 * Shared streaming client for every SSE endpoint in the app (docs/contracts.md
 * §2). Module agents MUST use this hook rather than writing their own stream
 * parser or using native `EventSource` (which cannot send a POST body).
 *
 * ```tsx
 * const { status, runs, events, error, start, abort } = useSse(
 *   "/api/fundamentals/sample",
 *   { providerId, model, messages, params, n: 3 },
 * );
 * ```
 */
export function useSse<TEvent extends SseEvent = SseEvent>(
  url: string | null,
  body: unknown,
  options: UseSseOptions = {},
): UseSseResult {
  const { autoStart = false, onEvent, headers } = options;

  const [status, setStatus] = useState<SseStatus>("idle");
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [runs, setRuns] = useState<Record<string, RunStreamState>>({});
  const [error, setError] = useState<SseClientError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  // Keep latest url/body/headers in refs so `start` is stable without
  // re-subscribing effects every render (callers often pass inline objects).
  const urlRef = useRef(url);
  urlRef.current = url;
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const headersRef = useRef(headers);
  headersRef.current = headers;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const applyEvent = useCallback((evt: SseEvent) => {
    setEvents((prev) => [...prev, evt]);
    onEventRef.current?.(evt as TEvent);

    if (evt.type === "done") return; // no runId; terminal handling lives in the read loop

    const runId = "runId" in evt ? evt.runId : undefined;
    if (!runId) return; // connection-level error with no runId

    setRuns((prev) => {
      const existing = prev[runId] ?? emptyRun(runId);
      const nextEvents = [...existing.events, evt];
      let next: RunStreamState = { ...existing, events: nextEvents };

      switch (evt.type) {
        case "run_start":
          next.status = "streaming";
          break;
        case "token":
          next.status = "streaming";
          next.tokens = [...existing.tokens, evt.token];
          break;
        case "run_complete":
          next.status = "complete";
          next.run = evt.run;
          break;
        case "error":
          next.status = "error";
          next.error = { code: evt.code, message: evt.message };
          break;
        default:
          // logprobs / tool_call / tool_result / agent_step / stage / progress:
          // recorded in `events` above, no dedicated field needed.
          break;
      }

      return { ...prev, [runId]: next };
    });
  }, []);

  const finalizeIncompleteRuns = useCallback((reason: SseClientError) => {
    setRuns((prev) => {
      const next: Record<string, RunStreamState> = {};
      for (const [id, run] of Object.entries(prev)) {
        next[id] =
          run.status === "pending" || run.status === "streaming"
            ? { ...run, status: "error", error: reason }
            : run;
      }
      return next;
    });
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    inFlightRef.current = false;
    setStatus("aborted");
  }, []);

  const start = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl || inFlightRef.current) return;

    // Reset state for a fresh run.
    setEvents([]);
    setRuns({});
    setError(null);
    setStatus("connecting");

    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;

    void (async () => {
      let sawDone = false;
      try {
        const res = await fetch(currentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headersRef.current,
          },
          body: JSON.stringify(bodyRef.current),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let message = `Request failed with status ${res.status}`;
          let code = "PROVIDER_ERROR";
          try {
            const parsed = (await res.json()) as { code?: string; message?: string };
            message = parsed.message ?? message;
            code = parsed.code ?? code;
          } catch {
            // body wasn't JSON; keep the generic message above
          }
          const connError = { code, message };
          setError(connError);
          setStatus("error");
          inFlightRef.current = false;
          return;
        }

        setStatus("streaming");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseFrameParser();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const frames = parser.push(chunk);
          for (const frame of frames) {
            let json: unknown;
            try {
              json = JSON.parse(frame.data);
            } catch {
              continue; // malformed frame; skip rather than crash the stream
            }
            const result = SseEventSchema.safeParse(json);
            if (!result.success) continue;
            const evt = result.data;
            if (evt.type === "done") {
              sawDone = true;
              continue;
            }
            applyEvent(evt);
          }
        }

        // Flush any trailing unterminated frame.
        for (const frame of parser.flush()) {
          try {
            const json = JSON.parse(frame.data);
            const result = SseEventSchema.safeParse(json);
            if (result.success) {
              if (result.data.type === "done") sawDone = true;
              else applyEvent(result.data);
            }
          } catch {
            // ignore malformed trailing frame
          }
        }

        inFlightRef.current = false;

        if (sawDone) {
          setStatus("done");
        } else {
          const connError: SseClientError = {
            code: "STREAM_CLOSED",
            message:
              'Connection closed before the stream finished (no "done" event received). Treat this run as failed.',
          };
          setError(connError);
          setStatus("error");
          finalizeIncompleteRuns(connError);
        }
      } catch (err) {
        inFlightRef.current = false;
        if (controller.signal.aborted) {
          setStatus("aborted");
          return;
        }
        const connError: SseClientError = {
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Unknown streaming error",
        };
        setError(connError);
        setStatus("error");
        finalizeIncompleteRuns(connError);
      }
    })();
  }, [applyEvent, finalizeIncompleteRuns]);

  useEffect(() => {
    if (autoStart && url) {
      start();
    }
    // Intentionally depends only on [autoStart, url]: `start` reads `body` from a ref at call
    // time, so re-running this effect on every `body` identity change would refire the request
    // on every render for callers who pass an inline object literal as `body`.
  }, [autoStart, url]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  return { events, runs, status, error, abort, start };
}
