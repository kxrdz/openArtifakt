/**
 * Security layer public surface (§9).
 *
 * The workspace path jail and secret-file rules are the non-negotiable gates
 * every tool passes through before touching the filesystem or running a
 * command.
 */
export * from "./path-jail";
export * from "./secrets";
