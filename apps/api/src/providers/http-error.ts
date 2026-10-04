/**
 * Builds a safe-to-surface error message for a failed upstream provider
 * HTTP call. The raw upstream response body is NEVER embedded verbatim:
 * it ends up in `Run.error` and the SSE `error` event's `message`, both of
 * which are client-visible, and upstream bodies can echo request content
 * (prompts) or, for auth-class statuses, credential/request-echo details.
 *
 *   - 401/403 (auth-class): the body is omitted entirely - only the status
 *     code and a generic reason are included.
 *   - everything else: the body is truncated to `maxBodyChars` so a large or
 *     sensitive upstream payload can't be fully reflected to the client.
 */
const MAX_BODY_CHARS = 200;
const AUTH_STATUSES = new Set([401, 403]);

export function buildProviderErrorMessage(
  providerName: string,
  status: number,
  bodyText: string,
  maxBodyChars: number = MAX_BODY_CHARS,
): string {
  if (AUTH_STATUSES.has(status)) {
    return `${providerName} API error ${status}: authentication/authorization failed (upstream response body omitted).`;
  }
  const truncated =
    bodyText.length > maxBodyChars ? `${bodyText.slice(0, maxBodyChars)}...(truncated)` : bodyText;
  return `${providerName} API error ${status}: ${truncated}`;
}
