import { z } from "zod";

/**
 * Canonical, provider-neutral message model (§3). Every provider adapter
 * converts to and from these shapes; the rest of the app never sees
 * provider-specific types.
 */

export const roleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type Role = z.infer<typeof roleSchema>;

export const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type TextPart = z.infer<typeof textPartSchema>;

export const toolCallPartSchema = z.object({
  type: z.literal("tool_call"),
  id: z.string(),
  name: z.string(),
  args: z.unknown(),
});
export type ToolCallPart = z.infer<typeof toolCallPartSchema>;

export const toolResultPartSchema = z.object({
  type: z.literal("tool_result"),
  callId: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolResultPart = z.infer<typeof toolResultPartSchema>;

export const contentPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
]);
export type ContentPart = z.infer<typeof contentPartSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: roleSchema,
  parts: z.array(contentPartSchema),
  createdAt: z.number(),
});
export type Message = z.infer<typeof messageSchema>;

/** Parse and validate an unknown value as a {@link Message}. Throws on failure. */
export function parseMessage(value: unknown): Message {
  return messageSchema.parse(value);
}

/** Parse and validate an unknown value as a {@link ContentPart}. Throws on failure. */
export function parseContentPart(value: unknown): ContentPart {
  return contentPartSchema.parse(value);
}

/** Type guard for {@link Message}. */
export function isMessage(value: unknown): value is Message {
  return messageSchema.safeParse(value).success;
}
