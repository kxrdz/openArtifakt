/**
 * Tool layer public surface (§8). The contract, the result-cap truncation
 * helper, the registry, the fs/gitignore helpers and the tool implementations
 * land here; the mutating and command tools arrive in tasks 2.3–2.4.
 */
export * from "./types";
export * from "./truncate";
export * from "./registry";
export * from "./fs";
export * from "./gitignore";
export * from "./read-file";
export * from "./list-directory";
export * from "./glob";
export * from "./search-code";
