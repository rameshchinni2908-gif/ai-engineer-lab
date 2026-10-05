import { apiFetch } from "@/lib/api";

export interface ValidationErrorItem {
  path: string;
  message: string;
}

export interface ValidateResponse {
  valid: boolean;
  errors: ValidationErrorItem[];
}

/** `POST /api/structured/validate` - pure, no LLM call, no Run. */
export function validateJson(json: unknown, schema: unknown): Promise<ValidateResponse> {
  return apiFetch<ValidateResponse>("/structured/validate", { method: "POST", body: { json, schema } });
}
