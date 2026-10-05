import { describe, expect, it } from "vitest";
import { redactPii } from "./pii.js";

describe("redactPii", () => {
  it("redacts a realistic email address", () => {
    const { redacted, matches } = redactPii("Contact me at jane.doe@example.com for details.");
    expect(redacted).toBe("Contact me at [REDACTED_EMAIL] for details.");
    expect(matches).toEqual([{ type: "email", value: "jane.doe@example.com" }]);
  });

  it("redacts realistic phone number formats", () => {
    expect(redactPii("Call (555) 123-4567 now.").redacted).toContain("[REDACTED_PHONE]");
    expect(redactPii("Call 555-123-4567 now.").redacted).toContain("[REDACTED_PHONE]");
    expect(redactPii("Call +1 555-123-4567 now.").redacted).toContain("[REDACTED_PHONE]");
  });

  it("redacts a realistic SSN", () => {
    const { redacted, matches } = redactPii("SSN: 123-45-6789");
    expect(redacted).toBe("SSN: [REDACTED_SSN]");
    expect(matches[0]).toEqual({ type: "ssn", value: "123-45-6789" });
  });

  it("redacts API-key-like tokens (sk- prefix, explicit assignment, and bare long tokens)", () => {
    expect(redactPii("key: sk-abcdefghij1234567890").redacted).toContain("[REDACTED_API_KEY]");
    expect(redactPii('api_key="abcdef1234567890"').redacted).toContain("[REDACTED_API_KEY]");
    expect(redactPii("token abc123ABC123abc123ABC123abc123ABC1").redacted).toContain("[REDACTED_API_KEY]");
  });

  it("redacts multiple distinct PII items in one pass", () => {
    const { matches } = redactPii("Email jane@example.com or call 555-123-4567, SSN 123-45-6789.");
    expect(matches.map((m) => m.type).sort()).toEqual(["email", "phone", "ssn"]);
  });

  it("does NOT mangle ordinary prose with no PII", () => {
    const text = "The quarterly report shows revenue grew by 12 percent, mostly from the enterprise segment.";
    expect(redactPii(text).redacted).toBe(text);
    expect(redactPii(text).matches).toEqual([]);
  });

  it("does NOT false-positive on short numbers, dates, or short identifiers", () => {
    const text = "Order #4521 was placed on 2024-01-15 and shipped via route 66.";
    expect(redactPii(text).redacted).toBe(text);
  });

  it("does NOT false-positive on a normal short word that happens to contain a hyphen", () => {
    const text = "This is a well-known, state-of-the-art approach.";
    expect(redactPii(text).redacted).toBe(text);
  });
});
