import type { ToolDefinition } from "@ail/shared";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const fileReaderDefinition: ToolDefinition = {
  name: "file_reader",
  description: "Reads a file by name from a small fixed set of sandboxed in-memory fixture files. Cannot access the real host filesystem.",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  dangerous: true,
  category: "filesystem",
};

/**
 * Deliberately NOT backed by real disk I/O. There is no `fs.readFile`
 * anywhere in this module - the "sandboxed directory" is this in-memory
 * map, so it is structurally impossible for `file_reader` to reach any
 * real host path, not merely blocked by a path check (the checks below
 * are still enforced, as a second, defense-in-depth layer, and so the
 * traversal-rejection behavior is genuinely exercised/testable).
 */
const VIRTUAL_FILES: Record<string, string> = {
  "readme.txt":
    "AI Engineer Lab agent file_reader sandbox.\nThis is the only directory this tool can ever see - there is no real filesystem access behind it.",
  "notes.md":
    "# Agent sandbox notes\n\n- file_reader is backed by an in-memory virtual file map, not real disk I/O.\n- The sandbox boundary is enforced by the tool's implementation, not the model's good behavior.",
  "sample-data.json": JSON.stringify({ items: [1, 2, 3], note: "sandboxed fixture data" }),
};

function isTraversalAttempt(requestedPath: string): boolean {
  if (requestedPath.length === 0) return true;
  if (requestedPath.includes("..")) return true;
  if (requestedPath.startsWith("/") || requestedPath.startsWith("\\")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(requestedPath)) return true; // Windows absolute path, e.g. "C:\"
  if (requestedPath.includes("\0")) return true;
  return false;
}

export async function runFileReader(args: unknown): Promise<ToolExecOutcome> {
  const a = args as { path?: unknown };
  if (typeof a?.path !== "string" || a.path.trim().length === 0) {
    return fail("file_reader: missing required string argument 'path'");
  }
  const requested = a.path.trim();

  if (isTraversalAttempt(requested)) {
    return fail(`file_reader: rejected path traversal/absolute path attempt: "${requested}"`);
  }

  const normalized = requested.replace(/^\.\//, "");
  const content = VIRTUAL_FILES[normalized];
  if (content === undefined) {
    return fail(`file_reader: no such sandboxed file "${normalized}". Available: ${Object.keys(VIRTUAL_FILES).join(", ")}`);
  }
  return ok(content);
}
