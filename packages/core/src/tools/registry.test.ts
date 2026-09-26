import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ToolRegistry } from "./registry";
import { defineTool, toToolDefinition } from "./types";

const readTool = defineTool({
  name: "read_file",
  description: "Read a file",
  parameters: z.object({ path: z.string() }),
  approval: "read",
  execute(args) {
    return { content: `read ${args.path}` };
  },
});

const writeTool = defineTool({
  name: "write_file",
  description: "Write a file",
  parameters: z.object({ path: z.string(), content: z.string() }),
  approval: "write",
  execute(args) {
    return { content: `wrote ${args.path}` };
  },
});

describe("ToolRegistry", () => {
  it("looks up tools by name", () => {
    const registry = new ToolRegistry().register(readTool).register(writeTool);

    expect(registry.get("read_file")).toBe(readTool);
    expect(registry.get("write_file")).toBe(writeTool);
    expect(registry.get("nope")).toBeUndefined();
  });

  it("reports presence and size", () => {
    const registry = new ToolRegistry().register(readTool);

    expect(registry.has("read_file")).toBe(true);
    expect(registry.has("nope")).toBe(false);
    expect(registry.size).toBe(1);
  });

  it("rejects duplicate names", () => {
    const registry = new ToolRegistry().register(readTool);

    expect(() => registry.register({ ...readTool })).toThrow(/already registered/);
  });

  it("lists tools in insertion order", () => {
    const registry = new ToolRegistry().register(readTool).register(writeTool);

    expect(registry.list().map((t) => t.name)).toEqual(["read_file", "write_file"]);
  });

  it("builds provider-facing definitions", () => {
    const registry = new ToolRegistry().register(readTool).register(writeTool);

    const defs = registry.toDefinitions();
    expect(defs.map((d) => d.name)).toEqual(["read_file", "write_file"]);
    expect(defs[0]!.parameters).toBe(readTool.parameters);
  });
});

describe("toToolDefinition", () => {
  it("maps a tool to name/description/parameters", () => {
    expect(toToolDefinition(readTool)).toEqual({
      name: "read_file",
      description: "Read a file",
      parameters: readTool.parameters,
    });
  });
});
