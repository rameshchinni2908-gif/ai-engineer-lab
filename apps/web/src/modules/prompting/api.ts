import type { PromptVersion } from "@ail/shared";
import { apiFetch } from "@/lib/api";

export interface RenderResponse {
  renderedPrompt: string;
  warnings: string[];
}

/** `POST /api/prompting/render` */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
  mode: "naive" | "hardened" = "hardened",
): Promise<RenderResponse> {
  return apiFetch<RenderResponse>("/prompting/render", { method: "POST", body: { template, variables, mode } });
}

export interface InjectionCheckResponse {
  safe: boolean;
  findings: string[];
}

/** `POST /api/prompting/injection-check` */
export function injectionCheck(template: string): Promise<InjectionCheckResponse> {
  return apiFetch<InjectionCheckResponse>("/prompting/injection-check", { method: "POST", body: { template } });
}

export interface CoachDiffToken {
  op: "add" | "remove" | "same";
  text: string;
}

export interface CoachResponse {
  score: number;
  issues: { label: string; detail: string }[];
  improvedPrompt: string;
  diff: CoachDiffToken[];
  metadata: { runId: string };
}

/** `POST /api/prompting/coach` */
export function coachPrompt(prompt: string): Promise<CoachResponse> {
  return apiFetch<CoachResponse>("/prompting/coach", { method: "POST", body: { prompt } });
}

export interface PaginatedPromptVersions {
  items: PromptVersion[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** `GET /api/prompting/prompt-versions` */
export function listPromptVersions(name?: string): Promise<PaginatedPromptVersions> {
  return apiFetch<PaginatedPromptVersions>("/prompting/prompt-versions", { query: { name } });
}

/** `POST /api/prompting/prompt-versions` */
export function createPromptVersion(body: {
  name: string;
  template: string;
  variables: string[];
  system?: string;
  notes?: string;
  tags?: string[];
}): Promise<PromptVersion> {
  return apiFetch<PromptVersion>("/prompting/prompt-versions", { method: "POST", body });
}

/** `PUT /api/prompting/prompt-versions/:id` - creates a NEW version row (append-only). */
export function updatePromptVersion(
  id: string,
  body: Partial<Omit<PromptVersion, "id">>,
): Promise<PromptVersion> {
  return apiFetch<PromptVersion>(`/prompting/prompt-versions/${id}`, { method: "PUT", body });
}

/** `DELETE /api/prompting/prompt-versions/:id` */
export function deletePromptVersion(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/prompting/prompt-versions/${id}`, { method: "DELETE" });
}
