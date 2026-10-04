import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

/** A saved, versioned prompt template used by the Prompt Engineering + Evals modules. */
export const PromptVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  template: z.string(),
  variables: z.array(z.string()),
  system: z.string().optional(),
  notes: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  parentVersionId: z.string().optional(),
  tags: z.array(z.string()),
});
export type PromptVersion = z.infer<typeof PromptVersionSchema>;
