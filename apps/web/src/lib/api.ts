import type {
  ApiError,
  ExplainRunRequest,
  ExplainRunResponse,
  ModelInfo,
  Paginated,
  ProviderId,
  Run,
  Trace,
} from "@ail/shared";
import { buildApiUrl } from "./api-url";

/**
 * Typed fetch client for the shared "platform" routes documented in
 * docs/contracts.md §3. Module agents (Wave 2) add their own per-module
 * fetchers next to their routes; they MAY import `apiFetch`/`ApiClientError`
 * from here to stay consistent, but must not edit this file (owned by
 * frontend-shell per §5).
 *
 * No API keys are ever read or sent from this file - the browser only ever
 * talks to our own `/api/*` origin, which proxies to apps/api.
 */

/** Thrown by `apiFetch` on any non-2xx response. Carries the parsed `ApiError` envelope. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = "ApiClientError";
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.status = status;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  return buildApiUrl(path, query);
}

/**
 * Low-level typed fetch wrapper. Throws `ApiClientError` on non-2xx.
 * Surfaces `x-request-id` on the returned value via `__requestId` is
 * intentionally NOT done (would pollute call sites) - read it from the
 * thrown `ApiClientError.requestId` on failure, or inspect
 * `res.headers.get("x-request-id")` by using `apiFetchRaw` when needed.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const res = await fetch(buildUrl(path, query), {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const requestId = res.headers.get("x-request-id") ?? "unknown";

  if (!res.ok) {
    let parsed: ApiError;
    try {
      parsed = (await res.json()) as ApiError;
    } catch {
      parsed = {
        code: "INTERNAL_ERROR",
        message: `Request failed with status ${res.status}`,
        requestId,
      };
    }
    throw new ApiClientError(res.status, parsed);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// §3 Shared/platform routes
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: boolean;
  mode: string;
  providers: { configured: Record<ProviderId, boolean> };
  db: { ok: boolean; driver?: string };
}

export const api = {
  health: (): Promise<HealthResponse> => apiFetch("/health"),

  models: (providerId?: ProviderId): Promise<{ models: ModelInfo[] }> =>
    apiFetch("/models", { query: { providerId } }),

  providers: (): Promise<{
    providers: { id: ProviderId; available: boolean; reason?: string }[];
  }> => apiFetch("/providers"),

  runs: (params: {
    moduleId?: string;
    feature?: string;
    providerId?: string;
    model?: string;
    traceId?: string;
    tags?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<Paginated<Run>> => apiFetch("/runs", { query: params }),

  run: (id: string): Promise<Run> => apiFetch(`/runs/${id}`),

  deleteRun: (id: string): Promise<{ ok: true }> =>
    apiFetch(`/runs/${id}`, { method: "DELETE" }),

  compareRuns: (
    a: string,
    b: string,
  ): Promise<{ a: Run; b: Run; diff: { field: string; aValue: unknown; bValue: unknown }[] }> =>
    apiFetch("/runs/compare", { query: { a, b } }),

  explainRun: (body: ExplainRunRequest): Promise<ExplainRunResponse> =>
    apiFetch("/explain-run", { method: "POST", body }),

  traces: (params: {
    moduleId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<Paginated<Trace>> => apiFetch("/traces", { query: params }),

  trace: (id: string): Promise<Trace> => apiFetch(`/traces/${id}`),

  replayRun: (
    id: string,
    overrideParams?: Run["params"],
  ): { url: string; body: unknown } => ({
    url: buildApiUrl(`/runs/${id}/replay`),
    body: { overrideParams },
  }),
};

/** Query keys for TanStack Query, centralized so invalidation stays consistent. */
export const queryKeys = {
  health: ["health"] as const,
  models: (providerId?: ProviderId) => ["models", providerId] as const,
  providers: ["providers"] as const,
  runs: (params: Record<string, unknown>) => ["runs", params] as const,
  run: (id: string) => ["runs", id] as const,
  compareRuns: (a: string, b: string) => ["runs", "compare", a, b] as const,
  traces: (params: Record<string, unknown>) => ["traces", params] as const,
  trace: (id: string) => ["traces", id] as const,
};
