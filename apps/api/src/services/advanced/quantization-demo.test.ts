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

  it("falls back to a default parameter count for an unknown model id rather than throwing", () => {
    expect(() => computeQuantizationDemo({ model: "some-unknown-model-id", precision: "fp16" })).not.toThrow();
  });
});
