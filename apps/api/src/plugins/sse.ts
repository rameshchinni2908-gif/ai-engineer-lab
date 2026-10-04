import type { FastifyReply } from "fastify";
import type { SseEvent } from "@ail/shared";

export interface SseWriter {
  /** Writes one `event: <type>` / `data: <json>` frame per docs/contracts.md §2.1. */
  send(event: SseEvent): void;
  /** Writes a `: ping` comment line. Called automatically on idle; exposed for tests. */
  ping(): void;
  /** Stops the heartbeat timer and ends the HTTP response. Call after the terminal `done` event. */
  close(): void;
}

export interface OpenSseStreamOptions {
  /** Heartbeat idle threshold in ms. Defaults to 15000 per the contract; tests may lower it. */
  heartbeatMs?: number;
}

/**
 * Opens a §2.1-compliant SSE response: headers set (incl. `x-request-id`)
 * BEFORE the first byte, one blank-line-terminated `event:`/`data:` frame per
 * `send()`, and a `: ping` heartbeat comment written whenever the stream has
 * been otherwise idle for `heartbeatMs`. Every module's streaming route
 * (generation, agent, RAG, eval, attack) must open its stream through this
 * helper rather than writing raw SSE frames itself, so the wire format never
 * drifts between modules.
 */
export function openSseStream(
  reply: FastifyReply,
  requestId: string,
  opts: OpenSseStreamOptions = {},
): SseWriter {
  const heartbeatMs = opts.heartbeatMs ?? 15_000;

  // Fastify's own response lifecycle is bypassed from here on - we own
  // `reply.raw` directly for the rest of this request.
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-request-id": requestId,
  });

  let lastActivity = Date.now();
  let closed = false;

  function write(chunk: string): void {
    if (closed) return;
    reply.raw.write(chunk);
    lastActivity = Date.now();
  }

  const timer = setInterval(() => {
    if (Date.now() - lastActivity >= heartbeatMs) {
      write(": ping\n\n");
    }
  }, heartbeatMs);

  return {
    send(event: SseEvent) {
      write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    ping() {
      write(": ping\n\n");
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      reply.raw.end();
    },
  };
}
