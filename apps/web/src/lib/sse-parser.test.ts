import { describe, expect, it } from "vitest";
import { SseFrameParser, parseSseFrame, splitSseFrames } from "./sse-parser";

describe("splitSseFrames", () => {
  it("splits complete frames on a blank line and keeps the trailing partial frame as `rest`", () => {
    const { frames, rest } = splitSseFrames('event: a\ndata: {"x":1}\n\nevent: b\ndata: {"x":2}\n\ndata: {"x":3');
    expect(frames).toEqual(['event: a\ndata: {"x":1}', 'event: b\ndata: {"x":2}']);
    expect(rest).toBe('data: {"x":3');
  });

  it("handles \\r\\n line endings", () => {
    const { frames } = splitSseFrames('event: a\r\ndata: {"x":1}\r\n\r\n');
    expect(frames).toHaveLength(1);
  });
});

describe("parseSseFrame", () => {
  it("parses event + data lines", () => {
    const frame = parseSseFrame('event: token\ndata: {"type":"token","runId":"r1","token":"hi","index":0}');
    expect(frame).toEqual({
      event: "token",
      data: '{"type":"token","runId":"r1","token":"hi","index":0}',
    });
  });

  it("ignores comment-only frames (heartbeats)", () => {
    expect(parseSseFrame(": ping")).toBeNull();
  });

  it("ignores comment lines mixed in, but still parses real data", () => {
    const frame = parseSseFrame(': ping\nevent: done\ndata: {"type":"done"}');
    expect(frame).toEqual({ event: "done", data: '{"type":"done"}' });
  });

  it("returns null for a frame with no data line at all", () => {
    expect(parseSseFrame("event: done")).toBeNull();
  });

  it("joins multiple data: lines with a newline, per the SSE spec", () => {
    const frame = parseSseFrame("data: line1\ndata: line2");
    expect(frame?.data).toBe("line1\nline2");
  });
});

describe("SseFrameParser (incremental)", () => {
  it("accumulates partial chunks and only emits complete frames", () => {
    const parser = new SseFrameParser();
    expect(parser.push('event: token\ndata: {"a":1')).toEqual([]);
    const frames = parser.push('}\n\n');
    expect(frames).toEqual([{ event: "token", data: '{"a":1}' }]);
  });

  it("ignores heartbeat comment frames between real frames", () => {
    const parser = new SseFrameParser();
    const frames = parser.push('data: {"a":1}\n\n: ping\n\ndata: {"a":2}\n\n');
    expect(frames).toEqual([{ event: undefined, data: '{"a":1}' }, { event: undefined, data: '{"a":2}' }]);
  });

  it("flush() emits a trailing frame that never got its terminating blank line", () => {
    const parser = new SseFrameParser();
    parser.push('data: {"a":1}\n\ndata: {"a":2}');
    expect(parser.flush()).toEqual([{ event: undefined, data: '{"a":2}' }]);
  });

  it("flush() emits nothing for a trailing heartbeat or empty buffer", () => {
    const parser = new SseFrameParser();
    parser.push(": ping");
    expect(parser.flush()).toEqual([]);
  });
});
