import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingRegion } from "./StreamingRegion";

describe("StreamingRegion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes a polite, non-atomic live region and aria-busy while streaming", () => {
    const { rerender } = render(<StreamingRegion text="Hello" status="streaming" />);

    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("aria-atomic", "false");

    const region = live.parentElement as HTMLElement;
    expect(region).toHaveAttribute("aria-busy", "true");

    rerender(<StreamingRegion text="Hello world" status="complete" tokenCount={2} />);
    expect(region).toHaveAttribute("aria-busy", "false");
  });

  it("announces a completion summary naming the token count - not the raw streamed text", () => {
    render(<StreamingRegion text="Hello world, this is the full streamed buffer." status="complete" tokenCount={2} />);

    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/generation complete, 2 tokens/i);
    expect(live.textContent).not.toContain("full streamed buffer");
  });

  it("announces a failure summary on status=\"error\"", () => {
    render(<StreamingRegion text="partial output" status="error" label="Sample 2" />);
    expect(screen.getByRole("status")).toHaveTextContent(/sample 2 failed/i);
  });

  it("throttles in-progress announcements instead of re-announcing on every token", () => {
    const { rerender } = render(<StreamingRegion text="one" status="streaming" tokenCount={1} />);
    const live = screen.getByRole("status");
    const firstAnnouncement = live.textContent;
    expect(firstAnnouncement).toMatch(/in progress, 1 token/i);

    // A token arrives immediately after - well within the throttle window - and must NOT
    // trigger an immediate re-announcement (that would spam/garble a screen reader).
    act(() => {
      rerender(<StreamingRegion text="one two" status="streaming" tokenCount={2} />);
    });
    expect(live.textContent).toBe(firstAnnouncement);

    // Once enough time has passed, a pending/subsequent update is allowed to announce
    // again - the live region is not permanently stuck on the very first message.
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(live.textContent).not.toBe(firstAnnouncement);
    expect(live.textContent).toMatch(/in progress, \d+ tokens?/i);
  });

  it("renders the visible text block as aria-hidden so it isn't double-announced", () => {
    render(<StreamingRegion text="visible text" status="streaming" />);
    const hiddenBlock = screen.getByText("visible text");
    expect(hiddenBlock).toHaveAttribute("aria-hidden", "true");
  });
});
