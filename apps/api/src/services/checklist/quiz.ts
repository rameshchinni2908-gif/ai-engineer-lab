import { notFoundError } from "../../middleware/errors.js";
import { QUIZ_ANSWER_KEYS } from "./answer-keys.js";
import { recordQuizScore } from "./progress.js";

export interface SubmitQuizResult {
  score: number;
  correct: Record<string, boolean>;
  explanations: Record<string, string>;
}

/**
 * `POST /checklist/quiz/:quizId/submit`. `answers` maps questionId -> the
 * submitted option INDEX as a string (e.g. `{"production-q1": "1"}`) -
 * matching how the frontend quiz UI serializes a selected radio option.
 * Scores against the server-side `QUIZ_ANSWER_KEYS` duplicate (see that
 * file's header for why), never trusting a client-supplied answer key.
 */
export async function submitQuiz(
  quizId: string,
  answers: Record<string, string>,
): Promise<SubmitQuizResult> {
  const key = QUIZ_ANSWER_KEYS[quizId];
  if (!key) throw notFoundError(`Quiz ${quizId} not found`);

  const correct: Record<string, boolean> = {};
  const explanations: Record<string, string> = {};
  let correctCount = 0;
  const questionIds = Object.keys(key);

  for (const questionId of questionIds) {
    const entry = key[questionId]!;
    const submittedRaw = answers[questionId];
    const submittedIndex = submittedRaw === undefined ? undefined : Number(submittedRaw);
    const isCorrect = submittedIndex === entry.correctIndex;
    correct[questionId] = isCorrect;
    explanations[questionId] = entry.explanation;
    if (isCorrect) correctCount++;
  }

  const score = questionIds.length > 0 ? correctCount / questionIds.length : 0;
  await recordQuizScore(quizId, score);

  return { score, correct, explanations };
}
