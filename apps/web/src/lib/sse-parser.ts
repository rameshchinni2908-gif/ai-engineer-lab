/**
 * Pure SSE frame parser for the wire format in docs/contracts.md §2.1:
 *
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * Kept dependency-free and pure (no fetch/stream logic) so it is trivially
 * unit-testable in isolation from `hooks/useSse.ts`, which owns the
 * fetch + ReadableStream plumbing and calls into this module per chunk.
 */

export interface ParsedSseFrame {
  /** Value of the `event:` line, if present. Per contract, callers must trust `data.type`, not this. */
  event?: string;
  /** Joined `data:` line(s) for this frame, still a raw JSON string (not yet parsed). */
  data: string;
}

/**
 * Split a growing text buffer into complete frames (separated by a blank
 * line) plus the trailing incomplete remainder. Handles both `\n\n` and
 * `\r\n\r\n` terminators.
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts, rest };
}

/**
 * Parse one raw frame's lines into `{ event, data }`. Returns `null` for
 * comment-only frames (heartbeats, e.g. `: ping`) or frames with no `data:`
 * line - callers MUST ignore these per §2.1, never surface them as events.
 */
export function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split("\n");
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith(":")) continue; // comment line - heartbeat, always ignored
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
    // Unknown field lines (id:, retry:) are not used by this protocol; ignored.
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * Incremental stateful wrapper: feed raw text chunks as they arrive from the
 * `ReadableStream` reader, get back any newly-completed frames.
 */
export class SseFrameParser {
  private buffer = "";

  push(chunk: string): ParsedSseFrame[] {
    this.buffer += chunk;
    const { frames, rest } = splitSseFrames(this.buffer);
    this.buffer = rest;
    const parsed: ParsedSseFrame[] = [];
    for (const frame of frames) {
      const result = parseSseFrame(frame);
      if (result) parsed.push(result);
    }
    return parsed;
  }

  /** Call once the stream ends, in case the server didn't terminate the last frame with a blank line. */
  flush(): ParsedSseFrame[] {
    if (this.buffer.trim().length === 0) {
      this.buffer = "";
      return [];
    }
    const result = parseSseFrame(this.buffer);
    this.buffer = "";
    return result ? [result] : [];
  }
}
