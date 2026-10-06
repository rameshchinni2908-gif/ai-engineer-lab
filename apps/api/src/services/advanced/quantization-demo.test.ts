import { describe, expect, it } from "vitest";
import { computeQuantizationDemo } from "./quantization-demo.js";

describe("computeQuantizationDemo", () => {
  it("int4 produces a smaller approxSizeMb than int8, which is smaller than fp16, for the same model", () => {
    const fp16 = computeQuantizationDemo({ model: "llama3.1:8b", precision: "fp16" });
    const int8 = computeQuantizationDemo({ model: "llama3.1:8b", precision: "int8" });
    const int4 = computeQuantizationDemo({ model: "llama3.1:8b", precision: "int4" });
    expect(int8.approxSizeMb).toBeLessThan(fp16.approxSizeMb);
    expect(int4.approxSizeMb).toBeLessThan(int8.approxSizeMb);
  });

  it("int4 has a lower (faster) approxLatencyFactor than fp16", () => {
    const fp16 = computeQuantizationDemo({ model: "gpt-4o-mini", precision: "fp16" });
    const int4 = computeQuantizationDemo({ model: "gpt-4o-mini", precision: "int4" });
    expect(int4.approxLatencyFactor).toBeLessThan(fp16.approxLatencyFactor);
  });

  it("always discloses the illustrative/order-of-magnitude caveat", () => {
    const result = computeQuantizationDemo({ model: "mock-large", precision: "int8" });
    expect(result.note.toLowerCase()).toContain("illustration");
    expect(result.qualityNotes.length).toBeGreaterThan(0);
  });

  it("falls back to a default parameter count (matching a known 8B-class model) for an unknown model id", () => {
    // A bare `.not.toThrow()` would also pass for a broken fallback that
    // silently returns NaN/undefined/0 - assert the actual output instead:
    // the documented default (DEFAULT_PARAM_BILLIONS = 8 in the source)
    // must produce the EXACT same result as a known 8B catalog model
    // (llama3.1:8b), not just "some number".
    const fallback = computeQuantizationDemo({ model: "some-unknown-model-id", precision: "fp16" });
    const known8B = computeQuantizationDemo({ model: "llama3.1:8b", precision: "fp16" });
    expect(fallback).toEqual(known8B);
    expect(Number.isFinite(fallback.approxSizeMb)).toBe(true);
    expect(fallback.approxSizeMb).toBeGreaterThan(0);
  });
});
