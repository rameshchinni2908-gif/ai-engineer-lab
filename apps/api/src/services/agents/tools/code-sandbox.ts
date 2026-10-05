import { Worker } from "node:worker_threads";
import type { ToolDefinition } from "@ail/shared";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const codeSandboxDefinition: ToolDefinition = {
  name: "code_sandbox",
  description: "Executes a short JavaScript snippet in an isolated worker thread with no filesystem/network access, a hard timeout, and a memory cap.",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" } },
    required: ["code"],
  },
  dangerous: true,
  category: "code",
};

const DEFAULT_TIMEOUT_MS = 500;
const TERMINATE_GRACE_MS = 150;
const MAX_OLD_GEN_MB = 32;
const MAX_YOUNG_GEN_MB = 16;

/**
 * SECURITY NOTE - read before touching this file, and read it again after
 * any edit: Node's own docs state plainly that `vm` is **not** a security
 * boundary by itself, even when hardened. This is a teaching sandbox
 * hardened in depth, not a hostile-code-proof jail - do not restore any
 * wording that claims otherwise.
 *
 * History: an earlier version merged host-realm `Math`/`JSON`/`Array`/
 * `Object`/`String`/`Number`/`Boolean` (and a host-realm `console` shim)
 * into the object passed to `vm.createContext()`. Every one of those
 * carries a `.constructor` chain back to the HOST's real `Function`, so
 * `Object.constructor("return this")()` returned the worker's real
 * `globalThis` - from there, real `process`/`process.env`, real `Buffer`,
 * global `fetch`, and `import()` (a language keyword, never gated by
 * omitting `require`) were all reachable. Fixing that (removing the
 * injected objects) was NOT sufficient on its own: `vm.createContext()`
 * called with no argument (or a plain `{}`) still links the new context's
 * global object's OWN prototype back to an object created in the HOST
 * realm (Node's "contextify" preserves that object's original prototype
 * for backward compatibility), so `this.constructor.constructor("return
 * process.env")()` - reachable via bare `this`/`globalThis`, not via any
 * injected reference - still walked straight back to the host and leaked
 * the real environment. Confirmed empirically before landing this fix
 * (see git history / the escape-attempt tests below, which fail against
 * either half-fixed version and pass against the current code).
 *
 * Current layered defences:
 *  1. **`vm.createContext(Object.create(null))`** - the sandbox object has
 *     NO prototype at all, so the resulting context's global cannot
 *     inherit the host's `Object.prototype`; every intrinsic
 *     (`Object`/`Array`/`Function`/`Math`/`JSON`/etc.) a script sees,
 *     whether referenced by bare identifier or reached by walking
 *     `.constructor` from `this`/`globalThis`/`[]`/`(function(){})`/any
 *     other context-native value, resolves within the CONTEXT's own
 *     fresh realm - there is no path back to the host's `Function`.
 *     `console` is defined by running a small, fixed SETUP script
 *     *inside* that context (a separate `vm.runInContext` call), not
 *     injected from outside, so `console.log` itself is context-native
 *     too - no host object or function is ever placed inside the context.
 *  2. **No dynamic `import()`.** `importModuleDynamically` is never
 *     configured, so Node refuses to service a dynamic `import()` call
 *     from code running in the context - `import('node:fs')`/
 *     `import('node:net')` reject/throw instead of resolving.
 *  3. **Worker thread isolation + hard timeout + terminate backstop.**
 *     Runs in a `node:worker_threads` `Worker`, separate from the main
 *     process; `vm.runInContext(..., { timeout })` bounds synchronous
 *     execution, and an outer `setTimeout(() => worker.terminate())`
 *     guarantees the thread itself dies even if something slips past the
 *     in-vm timeout (which only bounds synchronous script execution).
 *  4. **Heap `resourceLimits`** cap how much memory the worker can use.
 *
 * `eval`/`new Function` are never called in the MAIN process on user
 * code - the only "eval" is the `Worker(..., { eval: true })` entry
 * script below, which is entirely our own fixed, trusted bootstrap
 * (never user input); the user's submitted `code` travels only as an
 * inert string in `workerData`, evaluated by `vm.runInContext` inside the
 * context described above.
 */
const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

const { code, timeoutMs } = workerData;

// IMPORTANT: vm.createContext(Object.create(null)) - NOT vm.createContext()
// with no argument, and NOT a plain {}. Node's "contextify" mechanism
// links the new context's global object's OWN prototype to whatever
// object you pass as the sandbox (or to a plain {} it creates internally
// if you pass nothing) - and that object is created in the CALLER's
// (host) realm, so its prototype is the HOST's Object.prototype. That
// means "this"/"globalThis" at top level, while behaving like a fresh
// object for property-assignment purposes, still chains via
// Object.getPrototypeOf(this) to the HOST's Object.prototype -> HOST's
// Object -> HOST's Function, so "this.constructor.constructor(\\'return
// process\\')()" (and the equivalent via globalThis) reaches the real
// worker realm EVEN with nothing else injected. Passing Object.create(null)
// (no prototype at all) breaks that inherited link, so the resulting
// global's prototype resolves through the CONTEXT's own fresh intrinsics
// instead. Verified empirically (see code-sandbox.test.ts's escape-attempt
// suite) - this is not a theoretical nicety, the leak is real without it.
const context = vm.createContext(Object.create(null));

// console is defined FROM INSIDE the context (a separate runInContext
// call on trusted, fixed setup code), so it - and its .log function - are
// context-native, not host-realm references.
vm.runInContext(
  'globalThis.__output = []; globalThis.console = { log: function() { var p = []; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; p.push(typeof a === "string" ? a : JSON.stringify(a)); } __output.push(p.join(" ")); } };',
  context,
);

function readOutput() {
  try {
    return JSON.parse(vm.runInContext("JSON.stringify(__output)", context));
  } catch {
    return [];
  }
}

function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Script execution timed out after " + ms + "ms")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

(async () => {
  try {
    let result = vm.runInContext(code, context, { timeout: timeoutMs, displayErrors: true });
    // User code may be an async IIFE (e.g. one that attempts a dynamic
    // import) - the completion value is then a context-native Promise.
    // Awaiting it in the host is a one-way read of a value the sandbox
    // already produced; it grants the sandbox no new capability (the
    // host is already fully privileged), it just lets us report whether
    // that promise settled or rejected, bounded by the same time budget.
    if (result && typeof result.then === "function") {
      result = await withDeadline(Promise.resolve(result), timeoutMs);
    }
    let serialized;
    try {
      serialized = result === undefined ? "undefined" : JSON.stringify(result);
    } catch {
      serialized = String(result);
    }
    parentPort.postMessage({ ok: true, output: readOutput(), result: serialized });
  } catch (err) {
    parentPort.postMessage({ ok: false, output: readOutput(), error: err instanceof Error ? err.message : String(err) });
  }
})();
`;

interface WorkerResponse {
  ok: boolean;
  output: string[];
  result?: string;
  error?: string;
}

function runInWorker(code: string, timeoutMs: number): Promise<ToolExecOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: ToolExecOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    let worker: Worker;
    try {
      worker = new Worker(WORKER_BOOTSTRAP, {
        eval: true,
        // Pure, inert data only - a string and a number. No functions, no
        // file handles, no sockets, nothing that grants the worker any
        // capability beyond what WORKER_BOOTSTRAP itself already has.
        workerData: { code, timeoutMs },
        resourceLimits: {
          maxOldGenerationSizeMb: MAX_OLD_GEN_MB,
          maxYoungGenerationSizeMb: MAX_YOUNG_GEN_MB,
        },
        // Belt-and-suspenders: the worker has no reason to touch stdio.
        stdout: false,
        stderr: false,
      });
    } catch (err) {
      settle(fail(`code_sandbox: failed to start sandbox worker: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    // Backstop termination in case the in-vm `timeout` option doesn't cover
    // an async escape attempt (vm's timeout only interrupts synchronous
    // script execution) - the worker thread itself gets killed regardless.
    const killTimer = setTimeout(() => {
      settle(fail(`code_sandbox: execution exceeded ${timeoutMs}ms and the sandbox was terminated`));
      void worker.terminate();
    }, timeoutMs + TERMINATE_GRACE_MS);

    worker.once("message", (msg: WorkerResponse) => {
      clearTimeout(killTimer);
      const outputText = msg.output.length > 0 ? `${msg.output.join("\n")}\n` : "";
      if (msg.ok) {
        settle(ok(`${outputText}=> ${msg.result ?? "undefined"}`));
      } else {
        settle(fail(`${outputText}code_sandbox error: ${msg.error ?? "unknown error"}`));
      }
      void worker.terminate();
    });

    worker.once("error", (err) => {
      clearTimeout(killTimer);
      settle(fail(`code_sandbox: worker crashed: ${err.message}`));
    });

    worker.once("exit", (code_) => {
      clearTimeout(killTimer);
      if (!settled && code_ !== 0) {
        settle(fail(`code_sandbox: worker exited with code ${code_} (likely hit its memory cap)`));
      }
    });
  });
}

export async function runCodeSandbox(args: unknown): Promise<ToolExecOutcome> {
  const a = args as { code?: unknown; timeoutMs?: unknown };
  if (typeof a?.code !== "string" || a.code.trim().length === 0) {
    return fail("code_sandbox: missing required string argument 'code'");
  }
  const timeoutMs =
    typeof a.timeoutMs === "number" && a.timeoutMs > 0 && a.timeoutMs <= 5000 ? a.timeoutMs : DEFAULT_TIMEOUT_MS;
  return runInWorker(a.code, timeoutMs);
}
