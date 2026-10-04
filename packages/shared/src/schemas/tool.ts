import { z } from "zod";

export const ToolCategorySchema = z.enum([
  "math",
  "search",
  "retrieval",
  "code",
  "filesystem",
  "network",
  "memory",
  "other",
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

/** Describes a tool/function an agent or structured-output call may invoke. */
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** JSON Schema for the tool's input, kept as `unknown` so any draft validates at use-site. */
  inputSchema: z.unknown(),
  dangerous: z.boolean().optional(),
  category: ToolCategorySchema,
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  content: z.string(),
  isError: z.boolean(),
  durationMs: z.number().nonnegative(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;
