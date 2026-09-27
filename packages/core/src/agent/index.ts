/**
 * Agent-loop layer public surface (§8).
 *
 * The state machine, loop limits, identical-failure detection, context
 * manager, approval flow and cancellation land here; the orchestrating loop
 * and the runtime system prompt join them in later tasks of this feature.
 */
export * from "./state";
export * from "./limits";
export * from "./identical-failure";
export * from "./context";
export * from "./approval";
export * from "./cancellation";
