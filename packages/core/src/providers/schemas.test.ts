import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  toAnthropicJsonSchema,
  toGeminiJsonSchema,
  toOllamaJsonSchema,
  toOpenAiJsonSchema,
} from "./schemas";

const readFileTool = {
  name: "read_file",
  description: "Read a file",
  parameters: z.object({
    path: z.string().min(1),
    startLine: z.number().int().optional(),
  }),
};

const comprehensiveTool = {
  name: "configure",
  parameters: z.object({
    name: z.string().min(1),
    mode: z.enum(["safe", "full"]),
    retries: z.number().int(),
    ratio: z.number(),
    enabled: z.boolean(),
    tags: z.array(z.string()),
    nested: z.object({ depth: z.number() }),
  }),
};

describe("providers/schemas", () => {
  it("Anthropic: keeps the full zod JSON schema (draft 2020-12)", () => {
    const schema = toAnthropicJsonSchema(readFileTool);

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["path"]);
    expect(schema.properties).toMatchObject({
      path: { type: "string", minLength: 1 },
      startLine: { type: "integer" },
    });
  });

  it("OpenAI: strips $schema and additionalProperties at every level", () => {
    const schema = toOpenAiJsonSchema(readFileTool);

    expect(schema).not.toHaveProperty("$schema");
    expect(schema).not.toHaveProperty("additionalProperties");
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["path"]);
    expect(schema.properties).toEqual({
      path: { type: "string", minLength: 1 },
      startLine: {
        type: "integer",
        minimum: -9007199254740991,
        maximum: 9007199254740991,
      },
    });
  });

  it("Ollama: matches the OpenAI dialect", () => {
    expect(toOllamaJsonSchema(readFileTool)).toEqual(toOpenAiJsonSchema(readFileTool));
  });

  it("Gemini: reduces object/string/enum/number/boolean/array shapes to the accepted subset", () => {
    const schema = toGeminiJsonSchema(comprehensiveTool);

    expect(schema).toEqual({
      type: "OBJECT",
      properties: {
        name: { type: "STRING", minLength: 1 },
        mode: { type: "STRING", enum: ["safe", "full"] },
        retries: {
          type: "INTEGER",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
        },
        ratio: { type: "NUMBER" },
        enabled: { type: "BOOLEAN" },
        tags: { type: "ARRAY", items: { type: "STRING" } },
        nested: {
          type: "OBJECT",
          properties: { depth: { type: "NUMBER" } },
          required: ["depth"],
        },
      },
      required: ["name", "mode", "retries", "ratio", "enabled", "tags", "nested"],
    });
  });

  it("Gemini: strips $schema and additionalProperties recursively", () => {
    const schema = toGeminiJsonSchema(readFileTool);

    expect(schema).not.toHaveProperty("$schema");
    expect(schema).not.toHaveProperty("additionalProperties");
    expect(schema.properties?.path).not.toHaveProperty("$schema");
    expect(schema.properties?.path).not.toHaveProperty("additionalProperties");
  });

  it("Gemini: converts a const (literal) to a single-value enum", () => {
    const schema = toGeminiJsonSchema({
      name: "set_mode",
      parameters: z.object({ mode: z.literal("safe") }),
    });

    expect(schema.properties).toEqual({ mode: { type: "STRING", enum: ["safe"] } });
  });

  it("Gemini: maps a nullable type to nullable:true with a single type", () => {
    const schema = toGeminiJsonSchema({
      name: "with_default",
      parameters: z.object({ path: z.string().nullable() }),
    });

    expect(schema.properties?.path).toEqual({ type: "STRING", nullable: true });
  });

  it("Gemini: flattens unsupported constructs to a plain declaration", () => {
    const unionTool = {
      name: "choose",
      parameters: z.union([
        z.object({ a: z.string() }),
        z.object({ b: z.number() }),
      ]),
    };
    const tupleTool = {
      name: "pair",
      parameters: z.tuple([z.string(), z.number()]),
    };
    const recordTool = {
      name: "counts",
      parameters: z.record(z.string(), z.number()),
    };

    expect(toGeminiJsonSchema(unionTool)).toEqual({ type: "OBJECT" });
    expect(toGeminiJsonSchema(tupleTool)).toEqual({ type: "ARRAY" });
    expect(toGeminiJsonSchema(recordTool)).toEqual({ type: "OBJECT" });
  });
});
