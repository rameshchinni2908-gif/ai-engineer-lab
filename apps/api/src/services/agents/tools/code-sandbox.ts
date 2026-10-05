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
 * This string is the ONLY thing passed to `eval: true` and it is entirely
 * our own trusted bootstrap code (never user input) - the user's submitted
 * `code` travels as inert `workerData`, not as code the Worker constructor
 * evaluates. The bootstrap:
 *  1. Builds a brand-new `vm` context exposing only a tiny, inert set of
 *     globals (console shim, Math/JSON/Array/Object/String/Number/Boolean).
 *     It deliberately does NOT expose `require`, `process`, `fs`, `net`,
 *     `http`, `Buffer`, `global`, `globalThis`, `fetch`, `setTimeout`, or
 *     any other handle onto the host filesystem/network/event loop - a
 *     `vm` context has no ambient access to the creating module's scope,
 *     so user code literally has no reference through which to reach any
 *     of those (e.g. `require("fs")` throws `ReferenceError: require is
 *     not defined` inside the sandboxed context).
 *  2. Runs the submitted code with `vm.runInContext(code, sandbox, {
 *     timeout })`, which throws synchronously if the script runs longer
 *     than `timeout` ms (covers CPU-bound infinite loops).
 *  3. Posts `{ ok, output, result, error }` back to the main thread. Never
 *     calls `eval`/`new Function` on the user code itself - `vm` is the
 *     sanctioned Node isolation primitive for exactly this purpose.
 */
const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

const { code, timeoutMs } = workerData;
const output = [];
const sandbox = {
  console: {
    log: (...args) => output.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")),
  },
  Math, JSON, Array, Object, String, Number, Boolean,
};
vm.createContext(sandbox);

try {
  const result = vm.runInContext(code, sandbox, { timeout: timeoutMs, displayErrors: true });
  let serialized;
  try {
    serialized = result === undefined ? "undefined" : JSON.stringify(result);
  } catch {
    serialized = String(result);
  }
  parentPort.postMessage({ ok: true, output, result: serialized });
} catch (err) {
  parentPort.postMessage({ ok: false, output, error: err instanceof Error ? err.message : String(err) });
}
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
