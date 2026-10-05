#!/usr/bin/env node
/**
 * CI CLI for the Evals module (contracts §4 M7): runs the same check as
 * `POST /evals/ci-check` against a running API server and exits non-zero on
 * regression/threshold failure, zero when clean - so a CI pipeline can gate
 * a deploy on eval scores.
 *
 * Usage:
 *   pnpm --filter @ail/api evals:ci -- --suite <suiteResultId> \
 *     --threshold exact_match=0.8 --threshold latency=0.7 \
 *     [--api-url http://localhost:3001]
 *
 * `--threshold metricId=value` may be repeated once per metric. `--api-url`
 * defaults to `API_BASE_URL` env or `http://localhost:3001`.
 */
import { pathToFileURL } from "node:url";
import type { MetricId } from "@ail/shared";

export interface CliArgs {
  suiteResultId: string;
  thresholds: Partial<Record<MetricId, number>>;
  apiUrl: string;
}

export class CliArgError extends Error {}

/** Pure argv parser, unit-tested independently of any network call. */
export function parseCliArgs(argv: string[]): CliArgs {
  let suiteResultId: string | undefined;
  const thresholds: Partial<Record<MetricId, number>> = {};
  let apiUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--suite") {
      suiteResultId = argv[++i];
    } else if (arg === "--threshold") {
      const pair = argv[++i];
      if (!pair || !pair.includes("=")) {
        throw new CliArgError(`--threshold expects metricId=value, got "${pair ?? ""}"`);
      }
      const [metricId, rawValue] = pair.split("=");
      const value = Number(rawValue);
      if (!metricId || Number.isNaN(value)) {
        throw new CliArgError(`--threshold expects metricId=value, got "${pair}"`);
      }
      thresholds[metricId as MetricId] = value;
    } else if (arg === "--api-url") {
      apiUrl = argv[++i] ?? apiUrl;
    }
  }

  if (!suiteResultId) {
    throw new CliArgError("missing required --suite <suiteResultId>");
  }
  if (Object.keys(thresholds).length === 0) {
    throw new CliArgError("at least one --threshold metricId=value is required");
  }

  return { suiteResultId, thresholds, apiUrl };
}

export interface CliRunResult {
  exitCode: 0 | 1;
  output: string;
}

/** Runs the CI check via HTTP against a live API server. `fetchImpl` is injectable for tests. */
export async function runCiCli(argv: string[], fetchImpl: typeof fetch = fetch): Promise<CliRunResult> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    return { exitCode: 1, output: `[evals:ci] argument error: ${err instanceof Error ? err.message : String(err)}` };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${args.apiUrl}/api/evals/ci-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteResultId: args.suiteResultId, thresholds: args.thresholds }),
    });
  } catch (err) {
    return {
      exitCode: 1,
      output: `[evals:ci] request to ${args.apiUrl} failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    return { exitCode: 1, output: `[evals:ci] ci-check request failed (${res.status}): ${body}` };
  }

  const body = (await res.json()) as {
    pass: boolean;
    failures: { metricId: string; variantIndex: number; score: number; threshold: number }[];
  };

  if (body.pass) {
    return { exitCode: 0, output: `[evals:ci] PASS - suite ${args.suiteResultId} met all thresholds.` };
  }

  const lines = body.failures.map(
    (f) => `  - variant ${f.variantIndex}: ${f.metricId} scored ${f.score.toFixed(3)} (threshold ${f.threshold})`,
  );
  return {
    exitCode: 1,
    output: `[evals:ci] FAIL - suite ${args.suiteResultId} has ${body.failures.length} regression(s):\n${lines.join("\n")}`,
  };
}

// Executable entry point - only runs when this file is invoked directly
// (e.g. `tsx src/services/evals/cli.ts ...`), not when imported by tests.
// Uses `pathToFileURL` (not a manual string replace) so this also works
// correctly on Windows paths (drive letters, spaces, backslashes).
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runCiCli(process.argv.slice(2)).then(({ exitCode, output }) => {
    console.log(output);
    process.exitCode = exitCode;
  });
}
