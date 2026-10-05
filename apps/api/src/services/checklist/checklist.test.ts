import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-checklist-service.db");

const { closeDb } = await import("../../db/index.js");
const { getProgress, setItemCompletion, _resetProgressForTests } = await import("./progress.js");
const { submitQuiz } = await import("./quiz.js");
const { QUIZ_ANSWER_KEYS } = await import("./answer-keys.js");

describe("checklist progress persistence", () => {
  beforeEach(async () => {
    await _resetProgressForTests();
  });

  afterAll(() => {
    closeDb();
  });

  it("starts empty", async () => {
    const progress = await getProgress();
    expect(progress.completedItemIds).toEqual([]);
    expect(progress.quizScores).toEqual({});
  });

  it("marks an item complete and persists it", async () => {
    await setItemCompletion("item-1", true);
    const progress = await getProgress();
    expect(progress.completedItemIds).toContain("item-1");
  });

  it("un-marks a completed item", async () => {
    await setItemCompletion("item-1", true);
    await setItemCompletion("item-1", false);
    const progress = await getProgress();
    expect(progress.completedItemIds).not.toContain("item-1");
  });

  it("is idempotent when marking the same item complete twice", async () => {
    await setItemCompletion("item-1", true);
    await setItemCompletion("item-1", true);
    const progress = await getProgress();
    expect(progress.completedItemIds.filter((id) => id === "item-1")).toHaveLength(1);
  });
});

describe("quiz scoring", () => {
  beforeAll(async () => {
    await _resetProgressForTests();
  });

  it("every module has exactly 5 quiz questions in the server-side answer key", () => {
    const moduleIds = [
      "fundamentals", "prompting", "structured", "embeddings", "rag",
      "agents", "evals", "security", "production", "advanced", "checklist",
    ];
    for (const id of moduleIds) {
      expect(Object.keys(QUIZ_ANSWER_KEYS[id] ?? {})).toHaveLength(5);
    }
  });

  it("scores all-correct answers as 1.0", async () => {
    const key = QUIZ_ANSWER_KEYS.production!;
    const answers = Object.fromEntries(
      Object.entries(key).map(([qid, entry]) => [qid, String(entry.correctIndex)]),
    );
    const result = await submitQuiz("production", answers);
    expect(result.score).toBe(1);
    expect(Object.values(result.correct).every(Boolean)).toBe(true);
  });

  it("scores all-wrong answers as 0 and still returns explanations for every question", async () => {
    const key = QUIZ_ANSWER_KEYS.production!;
    const answers = Object.fromEntries(
      Object.entries(key).map(([qid, entry]) => [qid, String(entry.correctIndex + 1)]),
    );
    const result = await submitQuiz("production", answers);
    expect(result.score).toBe(0);
    expect(Object.values(result.correct).every((v) => v === false)).toBe(true);
    expect(Object.keys(result.explanations)).toHaveLength(5);
  });

  it("scores a mixed submission proportionally", async () => {
    const key = QUIZ_ANSWER_KEYS.production!;
    const entries = Object.entries(key);
    const answers: Record<string, string> = {};
    entries.forEach(([qid, entry], i) => {
      answers[qid] = i === 0 ? String(entry.correctIndex) : String(entry.correctIndex + 1);
    });
    const result = await submitQuiz("production", answers);
    expect(result.score).toBeCloseTo(1 / entries.length, 5);
  });

  it("treats a missing answer for a question as incorrect, not a crash", async () => {
    const key = QUIZ_ANSWER_KEYS.production!;
    const result = await submitQuiz("production", {});
    expect(result.score).toBe(0);
    expect(Object.keys(result.correct)).toHaveLength(Object.keys(key).length);
  });

  it("persists the resulting score into progress.quizScores", async () => {
    const key = QUIZ_ANSWER_KEYS.production!;
    const answers = Object.fromEntries(
      Object.entries(key).map(([qid, entry]) => [qid, String(entry.correctIndex)]),
    );
    await submitQuiz("production", answers);
    const progress = await getProgress();
    expect(progress.quizScores.production).toBe(1);
  });

  it("throws NOT_FOUND for an unknown quizId", async () => {
    await expect(submitQuiz("not-a-real-quiz", {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
