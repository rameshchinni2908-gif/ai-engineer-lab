import { describe, expect, it } from "vitest";
import { LEARNING_PATH } from "@/content";
import { prerequisitesMet, overallCompletion, validatePrerequisitesResolve } from "./learningPathLogic";

describe("prerequisitesMet", () => {
  const steps = LEARNING_PATH;

  it("a step with no prerequisites is always unlocked", () => {
    const step = steps.find((s) => s.prerequisites.length === 0)!;
    expect(prerequisitesMet(step, {})).toBe(true);
  });

  it("a step with prerequisites is locked until all are completed", () => {
    const step = steps.find((s) => s.prerequisites.length > 0)!;
    expect(prerequisitesMet(step, {})).toBe(false);
    const allDone = Object.fromEntries(step.prerequisites.map((id) => [id, true]));
    expect(prerequisitesMet(step, allDone)).toBe(true);
  });

  it("is locked if only SOME prerequisites are completed", () => {
    const step = steps.find((s) => s.prerequisites.length > 1);
    if (!step) return; // no multi-prereq step; nothing to assert
    const partial = { [step.prerequisites[0]!]: true };
    expect(prerequisitesMet(step, partial)).toBe(false);
  });
});

describe("overallCompletion", () => {
  it("is 0 with nothing completed and 1 with everything completed", () => {
    expect(overallCompletion(LEARNING_PATH, {})).toBe(0);
    const all = Object.fromEntries(LEARNING_PATH.map((s) => [s.id, true]));
    expect(overallCompletion(LEARNING_PATH, all)).toBe(1);
  });

  it("is proportional for a partial completion", () => {
    const first = LEARNING_PATH[0]!;
    expect(overallCompletion(LEARNING_PATH, { [first.id]: true })).toBeCloseTo(1 / LEARNING_PATH.length, 5);
  });
});

describe("validatePrerequisitesResolve (real content integrity)", () => {
  it("every prerequisite in the real LEARNING_PATH content resolves to a real step id", () => {
    expect(validatePrerequisitesResolve(LEARNING_PATH)).toEqual([]);
  });

  it("flags a dangling prerequisite reference", () => {
    const broken = [{ ...LEARNING_PATH[0]!, prerequisites: ["does-not-exist"] }];
    expect(validatePrerequisitesResolve(broken)).toHaveLength(1);
  });
});
