/**
 * OpenArtifact shared package.
 *
 * Home of the provider-neutral message model and stream event model with zod
 * schemas shared by both the server and the web client.
 */
export const SHARED_VERSION = "0.1.0";

export * from "./messages";
export * from "./events";
export * from "./chat";
