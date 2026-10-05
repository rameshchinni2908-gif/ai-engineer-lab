import { getDb } from "../../db/index.js";

/**
 * Single-user progress state (per contracts §4 M11: "one progress row in
 * SQLite, not per-user — no auth in v1"). Persisted as one JSON blob in the
 * generic `kv_settings` table (owned by backend-core, documented in
 * schema.sql as the intended reuse point for exactly this kind of
 * single-row JSON setting) rather than a bespoke table.
 */
const KV_KEY = "checklist_progress";

export interface ChecklistProgress {
  completedItemIds: string[];
  quizScores: Record<string, number>;
}

function emptyProgress(): ChecklistProgress {
  return { completedItemIds: [], quizScores: {} };
}

async function readProgress(): Promise<ChecklistProgress> {
  const db = await getDb();
  const row = db.prepare(`SELECT value FROM kv_settings WHERE key = ?`).get(KV_KEY) as
    | { value: string }
    | undefined;
  if (!row) return emptyProgress();
  try {
    const parsed = JSON.parse(row.value) as Partial<ChecklistProgress>;
    return {
      completedItemIds: parsed.completedItemIds ?? [],
      quizScores: parsed.quizScores ?? {},
    };
  } catch {
    return emptyProgress();
  }
}

async function writeProgress(progress: ChecklistProgress): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO kv_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(KV_KEY, JSON.stringify(progress), now);
}

/** `GET /checklist/progress`. */
export async function getProgress(): Promise<ChecklistProgress> {
  return readProgress();
}

/** `POST /checklist/progress/complete-item`. */
export async function setItemCompletion(itemId: string, completed: boolean): Promise<ChecklistProgress> {
  const progress = await readProgress();
  const set = new Set(progress.completedItemIds);
  if (completed) set.add(itemId);
  else set.delete(itemId);
  const next: ChecklistProgress = { ...progress, completedItemIds: [...set] };
  await writeProgress(next);
  return next;
}

/** Records a quiz score (used internally by `submitQuiz`; exported for tests). */
export async function recordQuizScore(quizId: string, score: number): Promise<ChecklistProgress> {
  const progress = await readProgress();
  const next: ChecklistProgress = {
    ...progress,
    quizScores: { ...progress.quizScores, [quizId]: score },
  };
  await writeProgress(next);
  return next;
}

/** Test-only reset so suites don't leak state across cases/files. */
export async function _resetProgressForTests(): Promise<void> {
  await writeProgress(emptyProgress());
}
