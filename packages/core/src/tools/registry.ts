import type { ToolDefinition } from "../providers/types";
import type { Tool } from "./types";
import { toToolDefinition } from "./types";

/**
 * A collection of tools keyed by name (§8). The agent loop resolves tool calls
 * through {@link ToolRegistry.get} and builds the provider-facing tool list
 * with {@link ToolRegistry.toDefinitions}.
 */
export class ToolRegistry {
  readonly #tools = new Map<string, Tool>();

  /** Register a tool; throws when the name is already taken. */
  register(tool: Tool): this {
    if (this.#tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.#tools.set(tool.name, tool);
    return this;
  }

  /** Look up a tool by name, or `undefined` when it is not registered. */
  get(name: string): Tool | undefined {
    return this.#tools.get(name);
  }

  /** True when a tool with `name` is registered. */
  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /** All registered tools, in insertion order. */
  list(): Tool[] {
    return [...this.#tools.values()];
  }

  /** The provider-facing definitions for every registered tool. */
  toDefinitions(): ToolDefinition[] {
    return this.list().map(toToolDefinition);
  }

  /** Number of registered tools. */
  get size(): number {
    return this.#tools.size;
  }
}
