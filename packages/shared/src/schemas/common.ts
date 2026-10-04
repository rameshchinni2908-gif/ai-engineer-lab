import { z } from "zod";

/** The 11 top-level learning modules. Route/content/nav code keys off this. */
export const ModuleIdSchema = z.enum([
  "fundamentals",
  "prompting",
  "structured",
  "embeddings",
  "rag",
  "agents",
  "evals",
  "security",
  "production",
  "advanced",
  "checklist",
]);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

/** Global Beginner/Intermediate/Senior content-depth toggle. */
export const DifficultySchema = z.enum(["beginner", "intermediate", "senior"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Supported LLM providers. `mock` MUST work with zero API keys. */
export const ProviderIdSchema = z.enum(["anthropic", "openai", "ollama", "mock"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** Standard error envelope returned by every API route on failure. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Generic paginated list envelope. Use `PaginatedSchema(ItemSchema)` to build one. */
export function PaginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
    hasMore: z.boolean(),
  });
}
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** ISO-8601 timestamp string, validated loosely (any value accepted by `Date`). */
export const IsoDateTimeSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Expected an ISO-8601 datetime string",
});
