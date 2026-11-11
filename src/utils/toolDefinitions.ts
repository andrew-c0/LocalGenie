import type { ToolDefinition, ToolSpec } from "../types";

/** The OpenAI tool object the server takes in `tools`, built from one registry entry. */
export function toToolDefinition(spec: ToolSpec): ToolDefinition {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  };
}

/** The OpenAI tool objects for a list of registry entries, in the same order. */
export function toToolDefinitions(specs: ToolSpec[]): ToolDefinition[] {
  return specs.map(toToolDefinition);
}
