import { describe, expect, it } from "vitest";
import type { McpServerConfig, McpServerInfo } from "../types";
import {
  addRow,
  changeRow,
  commandLineOf,
  configFromDraft,
  draftFromConfig,
  emptyDraft,
  hasDraftErrors,
  isHttpUrl,
  type KeyValueRow,
  type McpDraft,
  parseArgs,
  recordFromRows,
  removeRow,
  rowsFromRecord,
  sortServersByName,
  statusLabel,
  toolCountLabel,
  transportLabel,
  validateDraft,
} from "./mcpServers";

let counter = 0;
/** Ids for the rows in these tests: predictable, so the rows can be compared. */
function nextId(): string {
  counter += 1;
  return `row-${counter}`;
}

function stdioDraft(overrides: Partial<McpDraft> = {}): McpDraft {
  return { ...emptyDraft(), transport: "stdio", command: "npx", name: "Files", ...overrides };
}

function httpDraft(overrides: Partial<McpDraft> = {}): McpDraft {
  return {
    ...emptyDraft(),
    transport: "http",
    url: "https://mcp.example.com/mcp",
    name: "Web",
    ...overrides,
  };
}

const savedStdio: McpServerConfig = {
  id: "srv-1",
  name: "Files",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Work"],
  env: { API_KEY: "secret", MODE: "fast" },
  headers: {},
  enabled: true,
};

describe("draftFromConfig and configFromDraft", () => {
  it("starts a new server as an empty stdio form", () => {
    expect(draftFromConfig(null, nextId)).toEqual(emptyDraft());
    expect(emptyDraft().transport).toBe("stdio");
  });

  it("loads a saved stdio server into the form, one argument per line", () => {
    const draft = draftFromConfig(savedStdio, nextId);
    expect(draft.command).toBe("npx");
    expect(draft.argsText).toBe("-y\n@modelcontextprotocol/server-filesystem\nC:\\Work");
    expect(draft.env.map(({ key, value }) => [key, value])).toEqual([
      ["API_KEY", "secret"],
      ["MODE", "fast"],
    ]);
  });

  it("round-trips a stdio server through the form without change", () => {
    const draft = draftFromConfig(savedStdio, nextId);
    expect(configFromDraft(draft, "srv-1", true)).toEqual(savedStdio);
  });

  it("trims the name and the command and drops the other transport's fields", () => {
    const config = configFromDraft(
      stdioDraft({ name: "  Files  ", command: " npx ", url: "https://left.over" }),
      "",
      true,
    );
    expect(config).toEqual({
      id: "",
      name: "Files",
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
      headers: {},
      enabled: true,
    });
    expect(config).not.toHaveProperty("url");
  });

  it("keeps only the URL and headers for an HTTP server", () => {
    const config = configFromDraft(
      httpDraft({
        url: " https://mcp.example.com/mcp ",
        command: "left-over",
        argsText: "--x",
        headers: [{ id: "h", key: "Authorization", value: "Bearer t" }],
      }),
      "",
      false,
    );
    expect(config).toEqual({
      id: "",
      name: "Web",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      args: [],
      env: {},
      headers: { Authorization: "Bearer t" },
      enabled: false,
    });
    expect(config).not.toHaveProperty("command");
  });
});

describe("parseArgs", () => {
  it("reads one argument per line, trims each and drops blank lines", () => {
    expect(parseArgs("  -y \n\n server \r\n")).toEqual(["-y", "server"]);
  });

  it("returns no arguments for empty text", () => {
    expect(parseArgs("")).toEqual([]);
    expect(parseArgs("  \n  ")).toEqual([]);
  });
});

describe("isHttpUrl", () => {
  it("accepts http and https addresses with a host", () => {
    expect(isHttpUrl("https://example.com/mcp")).toBe(true);
    expect(isHttpUrl("http://localhost:8080")).toBe(true);
  });

  it("refuses other schemes, a missing host and text that is not a URL", () => {
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("file:///C:/x")).toBe(false);
    expect(isHttpUrl("npx server")).toBe(false);
    expect(isHttpUrl("https://")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("validateDraft", () => {
  it("asks for a name and a command for a program", () => {
    const errors = validateDraft(stdioDraft({ name: " ", command: "" }));
    expect(errors.name).toBe("Enter a name for this server.");
    expect(errors.command).toBe("Enter the program to run, for example npx.");
    expect(hasDraftErrors(errors)).toBe(true);
  });

  it("passes a complete program", () => {
    expect(validateDraft(stdioDraft())).toEqual({});
    expect(hasDraftErrors(validateDraft(stdioDraft()))).toBe(false);
  });

  it("asks for an address for a web server, and it must be http or https", () => {
    expect(validateDraft(httpDraft({ url: "" })).url).toBe("Enter the server's address.");
    expect(validateDraft(httpDraft({ url: "ws://x.test" })).url).toBe(
      "The address must start with http:// or https://.",
    );
    expect(validateDraft(httpDraft())).toEqual({});
  });

  it("checks only the chosen transport's fields", () => {
    const errors = validateDraft(stdioDraft({ url: "not a url" }));
    expect(errors).not.toHaveProperty("url");
    const webErrors = validateDraft(httpDraft({ command: "" }));
    expect(webErrors).not.toHaveProperty("command");
  });

  it("refuses a value with no name, and a name used twice", () => {
    const noName = validateDraft(stdioDraft({ env: [{ id: "a", key: "", value: "x" }] }));
    expect(noName.env).toBe("Each value needs a variable name.");

    const twice = validateDraft(
      stdioDraft({
        env: [
          { id: "a", key: "TOKEN", value: "1" },
          { id: "b", key: "TOKEN", value: "2" },
        ],
      }),
    );
    expect(twice.env).toBe("Two variables have the same name.");
  });

  it("allows an empty row, which is left out on save", () => {
    const draft = stdioDraft({ env: [{ id: "a", key: "", value: "" }] });
    expect(validateDraft(draft)).toEqual({});
    expect(configFromDraft(draft, "", true).env).toEqual({});
  });

  it("checks the header rows of a web server", () => {
    const errors = validateDraft(
      httpDraft({
        headers: [
          { id: "a", key: "X-Key", value: "1" },
          { id: "b", key: "X-Key", value: "2" },
        ],
      }),
    );
    expect(errors.headers).toBe("Two headers have the same name.");
  });
});

describe("recordFromRows", () => {
  it("keeps the named rows, trimmed, and the last value of a repeated name", () => {
    const rows: KeyValueRow[] = [
      { id: "a", key: " A ", value: "1" },
      { id: "b", key: "", value: "dropped" },
      { id: "c", key: "A", value: "2" },
    ];
    expect(recordFromRows(rows)).toEqual({ A: "2" });
  });

  it("reads a record back as rows in its key order", () => {
    const rows = rowsFromRecord({ B: "2", A: "1" }, nextId);
    expect(rows.map(({ key, value }) => [key, value])).toEqual([
      ["B", "2"],
      ["A", "1"],
    ]);
  });
});

describe("row edits", () => {
  const rows: KeyValueRow[] = [
    { id: "a", key: "A", value: "1" },
    { id: "b", key: "B", value: "2" },
  ];

  it("changes one row and leaves the others as they were", () => {
    const next = changeRow(rows, "b", { value: "9" });
    expect(next).toEqual([
      { id: "a", key: "A", value: "1" },
      { id: "b", key: "B", value: "9" },
    ]);
    expect(next[0]).toBe(rows[0]);
  });

  it("removes one row", () => {
    expect(removeRow(rows, "a")).toEqual([{ id: "b", key: "B", value: "2" }]);
  });

  it("adds an empty row at the end", () => {
    const next = addRow(rows, nextId);
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ key: "", value: "" });
  });
});

describe("commandLineOf", () => {
  it("shows the program and the arguments in order", () => {
    expect(commandLineOf("npx", ["-y", "server"])).toBe("npx -y server");
  });

  it("quotes an argument that has a space or a quote", () => {
    expect(commandLineOf("node", ["C:\\Program Files\\app.js", 'say "hi"'])).toBe(
      'node "C:\\Program Files\\app.js" "say \\"hi\\""',
    );
  });

  it("shows an empty argument as two quotes", () => {
    expect(commandLineOf("tool", [""])).toBe('tool ""');
  });

  it("is empty when there is no command", () => {
    expect(commandLineOf("  ", ["-y"])).toBe("");
  });
});

describe("labels", () => {
  it("names each status", () => {
    expect(statusLabel("stopped")).toBe("Stopped");
    expect(statusLabel("starting")).toBe("Starting");
    expect(statusLabel("running")).toBe("Running");
    expect(statusLabel("failed")).toBe("Failed");
  });

  it("names each transport", () => {
    expect(transportLabel("stdio")).toBe("Program (stdio)");
    expect(transportLabel("http")).toBe("Web address (HTTP)");
  });

  it("counts tools in the singular and the plural", () => {
    expect(toolCountLabel(0)).toBe("0 tools");
    expect(toolCountLabel(1)).toBe("1 tool");
    expect(toolCountLabel(4)).toBe("4 tools");
  });
});

describe("sortServersByName", () => {
  function info(id: string, name: string): McpServerInfo {
    return {
      config: { ...savedStdio, id, name },
      status: "stopped",
      toolCount: 0,
    };
  }

  it("orders the servers by name, without case, and does not change the input", () => {
    const input = [info("1", "beta"), info("2", "Alpha")];
    expect(sortServersByName(input).map((server) => server.config.name)).toEqual(["Alpha", "beta"]);
    expect(input.map((server) => server.config.name)).toEqual(["beta", "Alpha"]);
  });
});
