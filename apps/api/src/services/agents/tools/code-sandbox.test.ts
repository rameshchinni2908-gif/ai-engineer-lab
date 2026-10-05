import { describe, expect, it } from "vitest";
import { runCodeSandbox } from "./code-sandbox.js";

/**
 * Security-critical: these tests exercise the actual isolation boundary
 * (a real `node:worker_threads` Worker running a `vm` context), not a
 * mock of it. A regression here means the sandbox genuinely stopped being
 * a sandbox.
 */
describe("code_sandbox isolation", () => {
  it("runs ordinary arithmetic/console output and returns it", async () => {
    const outcome = await runCodeSandbox({ code: "console.log('hi'); 2 + 2" });
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toContain("hi");
    expect(outcome.content).toContain("4");
  }, 10_000);

  it("CANNOT read a host file - require('fs') is not defined inside the sandbox", async () => {
    const outcome = await runCodeSandbox({
      code: "require('fs').readFileSync('/etc/passwd', 'utf8')",
    });
    expect(outcome.isError).toBe(true);
    expect(outcome.content.toLowerCase()).toMatch(/require is not defined|referenceerror/);
  }, 10_000);

  it("CANNOT read a host file via a Windows-style path either", async () => {
    const outcome = await runCodeSandbox({
      code: "require('fs').readFileSync('C\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts', 'utf8')",
    });
    expect(outcome.isError).toBe(true);
    expect(outcome.content.toLowerCase()).toMatch(/require is not defined|referenceerror/);
  }, 10_000);

  it("CANNOT open a network socket - require('net') is not defined inside the sandbox", async () => {
    const outcome = await runCodeSandbox({
      code: "require('net').connect({ port: 80, host: 'example.com' })",
    });
    expect(outcome.isError).toBe(true);
    expect(outcome.content.toLowerCase()).toMatch(/require is not defined|referenceerror/);
  }, 10_000);

  it("CANNOT reach the network via a global fetch either - no such global is exposed", async () => {
    const outcome = await runCodeSandbox({ code: "fetch('https://example.com')" });
    expect(outcome.isError).toBe(true);
    expect(outcome.content.toLowerCase()).toMatch(/fetch is not defined|referenceerror/);
  }, 10_000);

  it("honours its timeout on an infinite loop instead of hanging forever", async () => {
    const start = Date.now();
    const outcome = await runCodeSandbox({ code: "while (true) {}", timeoutMs: 150 });
    const elapsed = Date.now() - start;
    expect(outcome.isError).toBe(true);
    // Either defense layer may win the race: `vm`'s own synchronous
    // `timeout` option, or the worker-termination backstop - both bound
    // execution; what matters is that it's genuinely bounded, not a hang.
    expect(outcome.content.toLowerCase()).toMatch(/timed out|exceeded.*terminated/);
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it("rejects a missing required 'code' argument", async () => {
    const outcome = await runCodeSandbox({});
    expect(outcome.isError).toBe(true);
  });

  it("surfaces a syntax error from inside the sandbox as a normal error result, not a crash", async () => {
    const outcome = await runCodeSandbox({ code: "this is not valid javascript (((" });
    expect(outcome.isError).toBe(true);
  }, 10_000);
});
