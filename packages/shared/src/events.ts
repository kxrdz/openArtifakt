import { z } from "zod";

/**
 * Canonical, provider-neutral stream events (§3). Every provider adapter maps
 * its native streaming format to these events; the agent loop, persistence,
 * and web UI consume only this shape.
 */

export const textDeltaEventSchema = z.object({
  type: z.literal("text_delta"),
  text: z.string(),
});
export type TextDeltaEvent = z.infer<typeof textDeltaEventSchema>;

export const toolCallStartEventSchema = z.object({
  type: z.literal("tool_call_start"),
  id: z.string(),
  name: z.string(),
});
export type ToolCallStartEvent = z.infer<typeof toolCallStartEventSchema>;

export const toolCallDeltaEventSchema = z.object({
  type: z.literal("tool_call_delta"),
  id: z.string(),
  argsDelta: z.string(),
});
export type ToolCallDeltaEvent = z.infer<typeof toolCallDeltaEventSchema>;

export const toolCallEndEventSchema = z.object({
  type: z.literal("tool_call_end"),
  id: z.string(),
  args: z.unknown(),
});
export type ToolCallEndEvent = z.infer<typeof toolCallEndEventSchema>;

export const usageEventSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number(),
  outputTokens: z.number(),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

export const stopReasonSchema = z.enum(["end_turn", "tool_use", "max_tokens", "cancelled"]);
export type StopReason = z.infer<typeof stopReasonSchema>;

export const doneEventSchema = z.object({
  type: z.literal("done"),
  stopReason: stopReasonSchema,
});
export type DoneEvent = z.infer<typeof doneEventSchema>;

export const errorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  retryable: z.boolean(),
});
export type ErrorEvent = z.infer<typeof errorEventSchema>;

export const streamEventSchema = z.discriminatedUnion("type", [
  textDeltaEventSchema,
  toolCallStartEventSchema,
  toolCallDeltaEventSchema,
  toolCallEndEventSchema,
  usageEventSchema,
  doneEventSchema,
  errorEventSchema,
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

/** Parse and validate an unknown value as a {@link StreamEvent}. Throws on failure. */
export function parseStreamEvent(value: unknown): StreamEvent {
  return streamEventSchema.parse(value);
}

/** Type guard for {@link StreamEvent}. */
export function isStreamEvent(value: unknown): value is StreamEvent {
  return streamEventSchema.safeParse(value).success;
}
