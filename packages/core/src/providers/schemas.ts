import { z } from "zod";

import type { ToolDefinition } from "./types";

/**
 * Tool-schema conversion (§4). Each tool defines its argument schema once with
 * zod; adapters convert it to the JSON-schema dialect their provider accepts.
 * Every converter is a pure function over the zod schema so each dialect is
 * unit-tested in isolation, and the agent loop never depends on a provider.
 *
 * Dialect rules (see design.md "Tool schemas"):
 * - Anthropic accepts a standard JSON Schema, so it receives the raw zod
 *   output (including `$schema` and `additionalProperties: false`).
 * - OpenAI-compatible and Ollama reject `$schema` and `additionalProperties`,
 *   so both are stripped recursively.
 * - Gemini accepts a subset: `$schema`/`additionalProperties` are stripped,
 *   `type` becomes a single upper-case enum value (`OBJECT`, `STRING`, ...),
 *   `const` becomes a single-value `enum`, a nullable type becomes
 *   `nullable: true`, and constructs Gemini cannot express (unions of objects,
 *   tuples, records) are flattened to a plain `OBJECT`/`ARRAY` declaration.
 */

export interface JsonSchema {
  [key: string]: unknown;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | boolean;
  prefixItems?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  format?: string;
  title?: string;
  default?: unknown;
  examples?: unknown[];
  $schema?: string;
  $comment?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  maxProperties?: number;
  nullable?: boolean;
  pattern?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
}

type NodeTransform = (node: JsonSchema) => JsonSchema;

function isSchemaObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rebuild a schema, applying `transform` to every node (post-order). */
function mapDeep(schema: JsonSchema, transform: NodeTransform): JsonSchema {
  const next: JsonSchema = { ...schema };

  if (schema.properties !== undefined) {
    next.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, mapDeep(value, transform)]),
    );
  }
  if (isSchemaObject(schema.items)) {
    next.items = mapDeep(schema.items, transform);
  }
  if (schema.prefixItems !== undefined) {
    next.prefixItems = schema.prefixItems.map((item) => mapDeep(item, transform));
  }
  if (isSchemaObject(schema.additionalProperties)) {
    next.additionalProperties = mapDeep(schema.additionalProperties, transform);
  }
  if (schema.propertyNames !== undefined) {
    next.propertyNames = mapDeep(schema.propertyNames, transform);
  }
  if (schema.anyOf !== undefined) {
    next.anyOf = schema.anyOf.map((item) => mapDeep(item, transform));
  }
  if (schema.oneOf !== undefined) {
    next.oneOf = schema.oneOf.map((item) => mapDeep(item, transform));
  }
  if (schema.allOf !== undefined) {
    next.allOf = schema.allOf.map((item) => mapDeep(item, transform));
  }
  if (schema.not !== undefined) {
    next.not = mapDeep(schema.not, transform);
  }

  return transform(next);
}

function rawSchema(tool: ToolDefinition): JsonSchema {
  return z.toJSONSchema(tool.parameters) as JsonSchema;
}

/** Anthropic accepts standard JSON Schema, so the raw zod output is enough. */
export function toAnthropicJsonSchema(tool: ToolDefinition): JsonSchema {
  return rawSchema(tool);
}

/** OpenAI-compatible and Ollama: strip `$schema` and `additionalProperties`. */
function stripRejected(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "additionalProperties") continue;
    out[key] = value;
  }
  return out;
}

export function toOpenAiJsonSchema(tool: ToolDefinition): JsonSchema {
  return mapDeep(rawSchema(tool), stripRejected);
}

export function toOllamaJsonSchema(tool: ToolDefinition): JsonSchema {
  return mapDeep(rawSchema(tool), stripRejected);
}

/** Gemini's accepted subset: upper-case `type`, `nullable`, string-only `enum`. */
const GEMINI_TYPES: Record<string, string> = {
  object: "OBJECT",
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
};

const GEMINI_UNSUPPORTED_KEYS = new Set<string>([
  "$schema",
  "$comment",
  "additionalProperties",
  "default",
  "examples",
  "anyOf",
  "oneOf",
  "allOf",
  "prefixItems",
  "propertyNames",
  "not",
  "contains",
  "const",
]);

function geminiType(node: JsonSchema): string {
  const raw = node.type;
  if (typeof raw === "string") {
    return GEMINI_TYPES[raw] ?? "OBJECT";
  }
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => entry !== "null");
    return first !== undefined ? (GEMINI_TYPES[first] ?? "OBJECT") : "OBJECT";
  }
  if (node.properties !== undefined || node.required !== undefined) return "OBJECT";
  if (node.items !== undefined) return "ARRAY";
  if (node.enum !== undefined) return "STRING";
  return "OBJECT";
}

function isNullable(node: JsonSchema): boolean {
  return Array.isArray(node.type) && node.type.includes("null");
}

function reduceGemini(node: JsonSchema): JsonSchema {
  // Tuples (`prefixItems`) have no Gemini equivalent: flatten to a plain array.
  if (node.prefixItems !== undefined) {
    return { type: "ARRAY" };
  }

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (GEMINI_UNSUPPORTED_KEYS.has(key)) continue;
    out[key] = value;
  }

  // `const` has no Gemini equivalent; express it as a single-value `enum`.
  if (node.const !== undefined && node.enum === undefined) {
    out.enum = [node.const];
  }

  out.type = geminiType(node);
  if (isNullable(node)) {
    out.nullable = true;
  }

  return out;
}

export function toGeminiJsonSchema(tool: ToolDefinition): JsonSchema {
  return mapDeep(rawSchema(tool), reduceGemini);
}
