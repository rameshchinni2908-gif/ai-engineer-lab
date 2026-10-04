import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSse } from "./useSse";

function streamResponse(chunks: string[], init: { ok?: boolean; status?: number } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe("useSse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores heartbeat comment lines and streams tokens for a single run", async () => {
    const chunks = [
      sseFrame({ type: "run_start", runId: "r1" }),
      ": ping\n\n",
      sseFrame({ type: "token", runId: "r1", token: "Hello", index: 0 }),
      sseFrame({ type: "token", runId: "r1", token: " world", index: 1 }),
      sseFrame({ type: "run_complete", runId: "r1", run: makeRun("r1") }),
      sseFrame({ type: "done" }),
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(streamResponse(chunks));

    const { result } = renderHook(() => useSse("/api/test", { foo: "bar" }));
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe("done"));

    expect(result.current.runs.r1?.status).toBe("complete");
    expect(result.current.runs.r1?.tokens.join("")).toBe("Hello world");
    // the heartbeat must never show up as a parsed event
    expect(result.current.events.some((e) => e.type === ("ping" as never))).toBe(false);
    expect(result.current.events.filter((e) => e.type === "token")).toHaveLength(2);
  });

  it("demultiplexes multiple runIds sharing one connection (e.g. n parallel samples)", async () => {
    const chunks = [
      sseFrame({ type: "run_start", runId: "a" }),
      sseFrame({ type: "run_start", runId: "b" }),
      sseFrame({ type: "token", runId: "a", token: "A1", index: 0 }),
      sseFrame({ type: "token", runId: "b", token: "B1", index: 0 }),
      sseFrame({ type: "token", runId: "a", token: "A2", index: 1 }),
      sseFrame({
        type: "run_complete",
        runId: "b",
        run: makeRun("b"),
      }),
      sseFrame({
        type: "run_complete",
        runId: "a",
        run: makeRun("a"),
      }),
      sseFrame({ type: "done" }),
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(streamResponse(chunks));

    const { result } = renderHook(() => useSse("/api/test", {}));
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe("done"));

    expect(Object.keys(result.current.runs).sort()).toEqual(["a", "b"]);
    expect(result.current.runs.a?.tokens.join("")).toBe("A1A2");
    expect(result.current.runs.b?.tokens.join("")).toBe("B1");
    expect(result.current.runs.a?.status).toBe("complete");
    expect(result.current.runs.b?.status).toBe("complete");
  });

  it("treats a connection that closes without a `done` event as a failed run", async () => {
    const chunks = [
      sseFrame({ type: "run_start", runId: "r1" }),
      sseFrame({ type: "token", runId: "r1", token: "partial", index: 0 }),
      // connection closes here - no `done` frame ever arrives
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(streamResponse(chunks));

    const { result } = renderHook(() => useSse("/api/test", {}));
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.error?.code).toBe("STREAM_CLOSED");
    expect(result.current.runs.r1?.status).toBe("error");
  });

  it("abort() marks the connection as aborted", async () => {
    // Never resolves within the test - abort() should flip status synchronously
    // regardless of the in-flight fetch's eventual outcome.
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<Response>(() => {}));

    const { result } = renderHook(() => useSse("/api/test", {}));
    act(() => result.current.start());
    expect(result.current.status).toBe("connecting");

    act(() => result.current.abort());
    await waitFor(() => expect(result.current.status).toBe("aborted"));
  });
});

function makeRun(id: string) {
  return {
    id,
    moduleId: "fundamentals",
    feature: "test",
    providerId: "mock",
    model: "mock-small",
    params: {},
    input: { messages: [] },
    output: { text: "done" },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" },
    latencyMs: 10,
    status: "complete",
    createdAt: new Date().toISOString(),
    tags: [],
    metadata: {},
  };
}
