import { describe, expect, it } from "vitest";
import { runFileReader } from "./file-reader.js";

describe("file_reader sandboxing", () => {
  it("reads a known sandboxed fixture file", async () => {
    const outcome = await runFileReader({ path: "readme.txt" });
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toContain("sandbox");
  });

  it("rejects '../' traversal attempts", async () => {
    const outcome = await runFileReader({ path: "../../../etc/passwd" });
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain("traversal");
  });

  it("rejects an absolute POSIX path", async () => {
    const outcome = await runFileReader({ path: "/etc/passwd" });
    expect(outcome.isError).toBe(true);
  });

  it("rejects an absolute Windows path", async () => {
    const outcome = await runFileReader({ path: "C:\\Windows\\System32\\config\\SAM" });
    expect(outcome.isError).toBe(true);
  });

  it("rejects a path containing a null byte", async () => {
    const outcome = await runFileReader({ path: "readme.txt\0.evil" });
    expect(outcome.isError).toBe(true);
  });

  it("there is no real filesystem access behind this tool at all - it cannot read an actual host file even by name collision", async () => {
    // No file named "package.json" exists in the virtual map, even though
    // one genuinely exists on the host filesystem right next to this test.
    const outcome = await runFileReader({ path: "package.json" });
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain("no such sandboxed file");
  });

  it("rejects a missing required argument", async () => {
    const outcome = await runFileReader({});
    expect(outcome.isError).toBe(true);
  });
});
