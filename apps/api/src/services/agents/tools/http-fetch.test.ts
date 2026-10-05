import { describe, expect, it } from "vitest";
import { runHttpFetch, validateFetchUrl } from "./http-fetch.js";

describe("http_fetch allow-list + SSRF defense", () => {
  it("rejects a host that is not on the allow-list (deny by default)", () => {
    const result = validateFetchUrl("https://evil.example.com/steal");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not on the allow-list");
  });

  it("allows an allow-listed host", () => {
    const result = validateFetchUrl("https://docs.ail-example.com/intro");
    expect(result.allowed).toBe(true);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.5", "10/8 private range"],
    ["172.16.0.1", "172.16/12 private range"],
    ["192.168.1.1", "192.168/16 private range"],
    ["169.254.169.254", "link-local / cloud metadata endpoint"],
    ["localhost", "localhost string"],
    ["::1", "IPv6 loopback"],
  ])("blocks SSRF attempt against %s (%s)", (host) => {
    const result = validateFetchUrl(`http://${host}/`);
    expect(result.allowed).toBe(false);
  });

  it("rejects non-http(s) protocols", () => {
    const result = validateFetchUrl("file:///etc/passwd");
    expect(result.allowed).toBe(false);
  });

  it("rejects a malformed URL cleanly (no throw)", () => {
    const result = validateFetchUrl("not a url");
    expect(result.allowed).toBe(false);
  });

  it("runHttpFetch returns isError:true for a blocked SSRF target, without making a real network call", async () => {
    const outcome = await runHttpFetch({ url: "http://169.254.169.254/latest/meta-data/" });
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain("blocked");
  });

  it("runHttpFetch succeeds for an allow-listed host with a deterministic mock body", async () => {
    const first = await runHttpFetch({ url: "https://docs.ail-example.com/intro" });
    const second = await runHttpFetch({ url: "https://docs.ail-example.com/intro" });
    expect(first.isError).toBe(false);
    expect(first.content).toBe(second.content); // deterministic, not a live fetch
  });

  it("runHttpFetch rejects a missing url argument", async () => {
    const outcome = await runHttpFetch({});
    expect(outcome.isError).toBe(true);
  });
});
