import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseBody, parseParams } from "../../plugins/validation.js";
import { getProgress, setItemCompletion, submitQuiz } from "../../services/checklist/index.js";

const CompleteItemBodySchema = z.object({
  itemId: z.string(),
  completed: z.boolean(),
});

const QuizParamsSchema = z.object({ quizId: z.string() });

const SubmitQuizBodySchema = z.object({
  answers: z.record(z.string(), z.string()),
});

/**
 * `/api/checklist/*` from contracts §4 M11. Mounted at prefix `/api/checklist`
 * by the route registry - paths here are relative to that prefix.
 */
const checklistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/progress", async () => {
    return getProgress();
  });

  app.post("/progress/complete-item", async (req) => {
    const { itemId, completed } = parseBody(CompleteItemBodySchema, req);
    return setItemCompletion(itemId, completed);
  });

  app.post("/quiz/:quizId/submit", async (req) => {
    const { quizId } = parseParams(QuizParamsSchema, req);
    const { answers } = parseBody(SubmitQuizBodySchema, req);
    return submitQuiz(quizId, answers);
  });
};

export default checklistRoutes;
