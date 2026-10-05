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

/**
 * Regression tests for a REAL escape that shipped in Wave 2 and was caught in
 * audit. The original sandbox merged host-realm intrinsics (`Math`, `JSON`,
 * `Object`, ...) into the context object, so `Object.constructor("return this")()`
 * walked the prototype chain into the HOST realm and returned the worker's real
 * `globalThis` - handing code `process`, `Buffer`, `fetch` and `import()`.
 *
 * Crucially, the original "CANNOT ..." tests above all PASSED while that hole was
 * open, because they only assert that the bare identifiers `require`/`fetch` are
 * undefined. A test that asserts the easy version of a security property is worse
 * than no test: it manufactures confidence. These assert the hard version.
 *
 * `expectBlocked` deliberately requires a non-error BASELINE elsewhere in this file
 * (the arithmetic test) - if the sandbox errored unconditionally, every assertion
 * here would pass vacuously.
 */
describe("code_sandbox realm-escape attempts (regression: Wave 2 audit BLOCKER)", () => {
  const escapes: Array<[name: string, code: string]> = [
    ["Object.constructor -> host globalThis", `Object.constructor("return this")().process.pid`],
    ["Function('return this') -> process", `Function("return this")().process.pid`],
    ["(function(){}).constructor -> process", `(function(){}).constructor("return process")().pid`],
    ["[].constructor.constructor -> process", `[].constructor.constructor("return process")().pid`],
    [
      "this.constructor.constructor -> process.env",
      `this.constructor.constructor("return process.env")().PATH`,
    ],
    [
      "getPrototypeOf(this) prototype walk",
      `Object.getPrototypeOf(this).constructor.constructor("return process")().pid`,
    ],
    ["globalThis.process", `globalThis.process.pid`],
    ["dynamic import('node:fs')", `import("node:fs")`],
    ["dynamic import('node:net')", `import("node:net")`],
    ["global fetch", `fetch("http://127.0.0.1/")`],
    ["Buffer", `Buffer.from("x").toString("hex")`],
  ];

  it.each(escapes)("blocks escape: %s", async (_name, code) => {
    const outcome = await runCodeSandbox({ code, timeoutMs: 2000 });
    expect(outcome.isError).toBe(true);
    // Must fail because the capability is genuinely absent from this realm -
    // not because of a timeout or an unrelated crash.
    expect(outcome.content).toMatch(
      /is not defined|Cannot read properties of undefined|dynamic import callback was not specified/i,
    );
    // Nothing resembling host state may ever come back.
    expect(outcome.content).not.toMatch(/\/usr\/|C:\\\\Windows|node_modules/i);
  }, 10_000);
});
