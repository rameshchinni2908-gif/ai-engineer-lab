/**
 * Typed HTTP error class + constructors matching docs/contracts.md §1's
 * HTTP-status <-> `code` table exactly. Routes/services throw these; the
 * central error handler (`error-handler.ts`) is the only place that knows
 * how to turn them into an `ApiErrorSchema` response body.
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "PROVIDER_ERROR"
  | "PROVIDER_TIMEOUT";

export class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(400, "VALIDATION_ERROR", message, details);
}
export function forbiddenError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(403, "FORBIDDEN", message, details);
}
export function notFoundError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", message, details);
}
export function conflictError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(409, "CONFLICT", message, details);
}
export function unprocessableError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(422, "UNPROCESSABLE", message, details);
}
export function providerError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(502, "PROVIDER_ERROR", message, details);
}
export function providerTimeoutError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(504, "PROVIDER_TIMEOUT", message, details);
}
export function internalError(message: string, details?: unknown): ApiHttpError {
  return new ApiHttpError(500, "INTERNAL_ERROR", message, details);
}
