/**
 * Agent-loop layer public surface (§8).
 *
 * The state machine, loop limits, identical-failure detection and the context
 * manager land here; the orchestrating loop (approval flow, cancellation) and
 * the runtime system prompt join them in later tasks of this feature.
 */
export * from "./state";
export * from "./limits";
export * from "./identical-failure";
export * from "./context";
