import { apiFetch } from "@/lib/api";

export interface ChecklistProgress {
  completedItemIds: string[];
  quizScores: Record<string, number>;
}

export interface QuizSubmitResult {
  score: number;
  correct: Record<string, boolean>;
  explanations: Record<string, string>;
}

export const checklistApi = {
  getProgress: () => apiFetch<ChecklistProgress>("/checklist/progress"),

  completeItem: (itemId: string, completed: boolean) =>
    apiFetch<ChecklistProgress>("/checklist/progress/complete-item", {
      method: "POST",
      body: { itemId, completed },
    }),

  submitQuiz: (quizId: string, answers: Record<string, string>) =>
    apiFetch<QuizSubmitResult>(`/checklist/quiz/${quizId}/submit`, { method: "POST", body: { answers } }),
};
