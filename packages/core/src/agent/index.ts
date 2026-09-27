/**
 * Agent-loop layer public surface (§8).
 *
 * The state machine, loop limits, identical-failure detection, context
 * manager, approval flow, cancellation and the orchestrating loop that ties
 * them together; the runtime system prompt lives in `../prompts`.
 */
export * from "./state";
export * from "./limits";
export * from "./identical-failure";
export * from "./context";
export * from "./approval";
export * from "./cancellation";
export * from "./loop";
