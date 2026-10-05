import { describe, expect, it } from "vitest";
import { assertVisionCapable } from "./multimodal.js";

describe("assertVisionCapable", () => {
  it("passes for a model whose catalog entry has supportsVision: true", () => {
    expect(() => assertVisionCapable("mock-large")).not.toThrow();
  });

  it("throws an UNPROCESSABLE (422) error for a model with supportsVision: false", () => {
    expect(() => assertVisionCapable("mock-small")).toThrow();
    try {
      assertVisionCapable("mock-small");
    } catch (err) {
      expect((err as { statusCode: number }).statusCode).toBe(422);
    }
  });

  it("throws for an unknown model id", () => {
    expect(() => assertVisionCapable("not-a-real-model")).toThrow();
  });
});
