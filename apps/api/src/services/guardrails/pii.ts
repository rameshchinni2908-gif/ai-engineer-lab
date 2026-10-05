/**
 * Pure PII detection/redaction. Patterns are intentionally conservative
 * (anchored, realistic formats) so ordinary prose is never mangled - see
 * `pii.test.ts` for both "catches realistic PII" and "leaves normal text
 * alone" assertions.
 */

export interface PiiMatch {
  type: "email" | "phone" | "ssn" | "api_key";
  value: string;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// US-style phone numbers: optional country code, optional parens/dashes/dots/spaces, 10 digits total.
const PHONE_RE = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// "sk-"-style provider keys, or an explicit key/secret/token=VALUE assignment, or a bare long high-entropy alphanumeric token.
const API_KEY_RE = /\b(?:sk-[A-Za-z0-9_-]{10,}|(?:api[_-]?key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{8,}['"]?|[A-Za-z0-9_-]{32,})\b/gi;

function redactWithPattern(
  text: string,
  pattern: RegExp,
  type: PiiMatch["type"],
  matches: PiiMatch[],
): string {
  return text.replace(pattern, (match) => {
    matches.push({ type, value: match });
    return `[REDACTED_${type.toUpperCase()}]`;
  });
}

/** Redacts emails, phone numbers, SSNs, and API-key-like tokens. Order matters: SSN/email/phone before the broader API-key catch-all, so a phone number isn't also flagged as a "long token". */
export function redactPii(text: string): { redacted: string; matches: PiiMatch[] } {
  const matches: PiiMatch[] = [];
  let redacted = text;
  redacted = redactWithPattern(redacted, EMAIL_RE, "email", matches);
  redacted = redactWithPattern(redacted, SSN_RE, "ssn", matches);
  redacted = redactWithPattern(redacted, PHONE_RE, "phone", matches);
  redacted = redactWithPattern(redacted, API_KEY_RE, "api_key", matches);
  return { redacted, matches };
}
