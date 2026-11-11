import { describe, expect, it } from "vitest";
import type { ToolSpec } from "../types";
import { toToolDefinition, toToolDefinitions } from "./toolDefinitions";

const listDirectory: ToolSpec = {
  id: "list_directory",
  name: "list_directory",
  description: "List the entries of a folder the user allowed.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  risk: "read",
  source: "native",
};

const readFile: ToolSpec = {
  id: "read_text_file",
  name: "read_text_file",
  description: "Read a text file the user allowed.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  source: "native",
};

describe("toToolDefinition", () => {
  it("wraps the spec as an OpenAI function tool", () => {
    expect(toToolDefinition(listDirectory)).toEqual({
      type: "function",
      function: {
        name: "list_directory",
        description: "List the entries of a folder the user allowed.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    });
  });

  it("leaves out the registry-only fields (id, risk, source)", () => {
    const definition = toToolDefinition(listDirectory);
    expect(Object.keys(definition)).toEqual(["type", "function"]);
    expect(Object.keys(definition.function)).toEqual(["name", "description", "parameters"]);
  });

  it("uses the name, not the id, as the function name", () => {
    const spec: ToolSpec = { ...listDirectory, id: "native.list", name: "list_directory" };
    expect(toToolDefinition(spec).function.name).toBe("list_directory");
  });
});

describe("toToolDefinitions", () => {
  it("maps every spec in the same order", () => {
    const definitions = toToolDefinitions([listDirectory, readFile]);
    expect(definitions.map((d) => d.function.name)).toEqual(["list_directory", "read_text_file"]);
    expect(definitions[0]).toEqual(toToolDefinition(listDirectory));
    expect(definitions[1]).toEqual(toToolDefinition(readFile));
  });

  it("returns an empty list when there are no specs", () => {
    expect(toToolDefinitions([])).toEqual([]);
  });
});
