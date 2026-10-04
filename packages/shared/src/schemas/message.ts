import { z } from "zod";

export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/** A single block inside a multi-modal / tool-aware message content array. */
export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image"),
    url: z.string().optional(),
    base64: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolCallId: z.string(),
    content: z.string(),
    isError: z.boolean().optional(),
  }),
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

/** Chat message. `content` is either plain text or a content-block array (multi-modal / tool). */
export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;
