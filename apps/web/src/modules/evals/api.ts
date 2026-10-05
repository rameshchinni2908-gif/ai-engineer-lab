import type { Dataset, EvalCase, EvalSuiteResult, EvalVariant, MetricId, Paginated } from "@ail/shared";
import { apiFetch } from "@/lib/api";

/** `GET /api/evals/datasets` */
export function listDatasets(params: { page?: number; pageSize?: number } = {}): Promise<Paginated<Dataset>> {
  return apiFetch("/evals/datasets", { query: params });
}

/** `POST /api/evals/datasets` */
export function createDataset(body: { name: string; description?: string; cases: EvalCase[] }): Promise<Dataset> {
  return apiFetch("/evals/datasets", { method: "POST", body });
}

/** `GET /api/evals/datasets/:id` */
export function getDataset(id: string): Promise<Dataset> {
  return apiFetch(`/evals/datasets/${id}`);
}

/** `DELETE /api/evals/datasets/:id` */
export function deleteDataset(id: string): Promise<{ ok: true }> {
  return apiFetch(`/evals/datasets/${id}`, { method: "DELETE" });
}

/** `POST /api/evals/datasets/:id/import` */
export function importDataset(id: string, format: "json" | "csv", content: string): Promise<{ imported: number; dataset: Dataset }> {
  return apiFetch(`/evals/datasets/${id}/import`, { method: "POST", body: { format, content } });
}

/** `GET /api/evals/datasets/:id/export` - returns raw text (JSON or CSV body). */
export async function exportDataset(id: string, format: "json" | "csv"): Promise<string> {
  const res = await fetch(`/api/evals/datasets/${id}/export?format=${format}`);
  return res.text();
}

/** `GET /api/evals/suite-results/:id` */
export function getSuiteResult(id: string): Promise<EvalSuiteResult> {
  return apiFetch(`/evals/suite-results/${id}`);
}

/** `GET /api/evals/suite-results` */
export function listSuiteResults(params: { datasetId?: string; page?: number; pageSize?: number } = {}): Promise<
  Paginated<EvalSuiteResult>
> {
  return apiFetch("/evals/suite-results", { query: params });
}

/** `POST /api/evals/ci-check` */
export function ciCheck(
  suiteResultId: string,
  thresholds: Partial<Record<MetricId, number>>,
): Promise<{ pass: boolean; failures: { metricId: MetricId; variantIndex: number; score: number; threshold: number }[] }> {
  return apiFetch("/evals/ci-check", { method: "POST", body: { suiteResultId, thresholds } });
}

export interface PositionBiasResult {
  forward: { winner: string; rationale: string };
  swapped: { winner: string; rationale: string };
  biasDetected: boolean;
  explanation: string;
}
export interface VerbosityBiasResult {
  naiveScore: number;
  lengthNormalizedScore: number;
  biasDetected: boolean;
  explanation: string;
}
export interface SelfEnhancementBiasResult {
  sameFamilyScore: number;
  thirdPartyJudgeScore: number;
  biasDetected: boolean;
  explanation: string;
}

/** `POST /api/evals/judge-bias-demo` */
export function runPositionBiasDemo(): Promise<PositionBiasResult> {
  return apiFetch("/evals/judge-bias-demo", { method: "POST", body: { demo: "position" } });
}
export function runVerbosityBiasDemo(conciseCorrect: string, verbosePadded: string): Promise<VerbosityBiasResult> {
  return apiFetch("/evals/judge-bias-demo", { method: "POST", body: { demo: "verbosity", conciseCorrect, verbosePadded } });
}
export function runSelfEnhancementBiasDemo(
  judgeProviderId: string,
  candidateProviderId: string,
): Promise<SelfEnhancementBiasResult> {
  return apiFetch("/evals/judge-bias-demo", {
    method: "POST",
    body: { demo: "self_enhancement", judgeProviderId, candidateProviderId },
  });
}

export interface CalibrationResult {
  n: number;
  agreementRate: number;
  meanAbsoluteError: number;
  correlation: number;
}

/** `POST /api/evals/judge-calibration` */
export function runJudgeCalibration(
  cases: { caseId: string; humanScore: number; judgeScore: number }[],
): Promise<CalibrationResult> {
  return apiFetch("/evals/judge-calibration", { method: "POST", body: { cases } });
}

export type { EvalVariant, MetricId };
