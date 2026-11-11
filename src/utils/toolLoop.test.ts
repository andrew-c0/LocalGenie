import { describe, expect, it } from "vitest";
import type {
  CapabilityEntry,
  ChatToolCall,
  Message,
  ToolResult,
  ToolResultAttachment,
  ToolSpec,
} from "../types";
import {
  buildToolMessage,
  buildToolRecord,
  cancelledOutcome,
  deniedOutcome,
  failedOutcome,
  folderNotice,
  MAX_CALLS_PER_ROUND,
  MAX_ROUNDS,
  noSourceOutcome,
  noVisionOutcome,
  offeredTools,
  offOutcome,
  pendingToolCalls,
  resultOutcome,
  skippedOutcome,
  splitCalls,
  TOOL_TEXT,
  toolCallsRefused,
  toolImageRef,
  toolsAllowedAfter,
  unknownToolOutcome,
} from "./toolLoop";

function call(id: string, name = "list_directory"): ChatToolCall {
  return { id, name, arguments: '{"path":"C:\\\\"}' };
}

function reply(id: string, toolCalls?: ChatToolCall[]): Message {
  return { id, role: "assistant", content: "", timestamp: 1, toolCalls };
}

function toolRow(id: string, callId: string): Message {
  return {
    id,
    role: "tool",
    kind: "tool",
    content: "result",
    timestamp: 2,
    toolRecord: { callId, name: "list_directory", arguments: "{}", status: "ok", approval: "auto" },
  };
}

function userPrompt(id: string): Message {
  return { id, role: "user", content: "hi", timestamp: 1 };
}

function scanEntry(overrides: Partial<CapabilityEntry>): CapabilityEntry {
  return {
    key: "toolCalls",
    status: "works",
    detail: null,
    probedAt: 1,
    stale: false,
    ...overrides,
  };
}

describe("limits", () => {
  it("allows tools until the fifth round, not after", () => {
    expect(MAX_ROUNDS).toBe(5);
    expect(MAX_CALLS_PER_ROUND).toBe(4);
    expect(toolsAllowedAfter(4)).toBe(true);
    expect(toolsAllowedAfter(MAX_ROUNDS)).toBe(false);
  });
});

describe("pendingToolCalls", () => {
  it("returns the calls of the last reply that have no row after it", () => {
    const messages = [userPrompt("u"), reply("r", [call("c1"), call("c2")]), toolRow("t1", "c1")];
    expect(pendingToolCalls(messages).map((c) => c.id)).toEqual(["c2"]);
  });

  it("is empty when every call has a row", () => {
    const messages = [userPrompt("u"), reply("r", [call("c1")]), toolRow("t1", "c1")];
    expect(pendingToolCalls(messages)).toEqual([]);
  });

  it("is empty when the last reply made no calls", () => {
    const messages = [userPrompt("u"), reply("r", [call("c1")]), toolRow("t1", "c1"), reply("r2")];
    expect(pendingToolCalls(messages)).toEqual([]);
  });

  it("returns every call when the reply has no rows yet", () => {
    const messages = [userPrompt("u"), reply("r", [call("c1"), call("c2")])];
    expect(pendingToolCalls(messages).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("ignores calls of an older turn once a user message follows", () => {
    const messages = [reply("r", [call("c1")]), userPrompt("u")];
    expect(pendingToolCalls(messages)).toEqual([]);
  });

  it("looks past system lines and tool rows to find the last reply", () => {
    const system: Message = { id: "s", role: "system", kind: "system", content: "x", timestamp: 3 };
    const messages = [reply("r", [call("c1")]), system];
    expect(pendingToolCalls(messages).map((c) => c.id)).toEqual(["c1"]);
  });

  it("is empty for no messages", () => {
    expect(pendingToolCalls([])).toEqual([]);
  });
});

describe("splitCalls", () => {
  it("runs the first four calls and skips the rest, in order", () => {
    const calls = [call("a"), call("b"), call("c"), call("d"), call("e")];
    const { run, skipped } = splitCalls(calls);
    expect(run.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(skipped.map((c) => c.id)).toEqual(["e"]);
  });

  it("skips nothing at the limit", () => {
    const { run, skipped } = splitCalls([call("a"), call("b")]);
    expect(run).toHaveLength(2);
    expect(skipped).toEqual([]);
  });
});

describe("tool rows", () => {
  it("builds a record with the call's id, name and arguments", () => {
    const record = buildToolRecord(
      call("c1"),
      resultOutcome({ ok: true, content: "a.txt", truncated: false, durationMs: 12 }, "auto"),
    );
    expect(record).toEqual({
      callId: "c1",
      name: "list_directory",
      arguments: '{"path":"C:\\\\"}',
      status: "ok",
      approval: "auto",
      durationMs: 12,
      truncated: false,
    });
  });

  it("builds a tool message with role and kind tool, and the result as its content", () => {
    const message = buildToolMessage(
      call("c1"),
      resultOutcome({ ok: false, content: "not found", truncated: false, durationMs: 3 }, "once"),
      "row-1",
      99,
    );
    expect(message).toMatchObject({
      id: "row-1",
      role: "tool",
      kind: "tool",
      content: "not found",
      timestamp: 99,
      toolRecord: { callId: "c1", status: "error", approval: "once" },
    });
  });

  it("uses the fixed texts and statuses for calls that did not run", () => {
    expect(deniedOutcome()).toEqual({
      status: "denied",
      content: TOOL_TEXT.denied,
      approval: "once",
    });
    expect(cancelledOutcome()).toEqual({
      status: "cancelled",
      content: TOOL_TEXT.cancelled,
      approval: "once",
    });
    expect(offOutcome()).toEqual({
      status: "denied",
      content: "This tool is turned off.",
      approval: "once",
    });
    expect(skippedOutcome().content).toBe(
      "Skipped: too many tool calls in one step (the limit is 4).",
    );
    expect(unknownToolOutcome("nope")).toEqual({
      status: "error",
      content: "Unknown tool: nope",
      approval: "auto",
    });
  });

  it("turns a thrown error into an error outcome with its message", () => {
    expect(failedOutcome("disk gone", "chat")).toEqual({
      status: "error",
      content: "disk gone",
      approval: "chat",
    });
  });
});

describe("offeredTools", () => {
  const specs: ToolSpec[] = [
    {
      id: "list_directory",
      name: "list_directory",
      description: "List.",
      parameters: {},
      risk: "read",
      source: "native",
    },
    {
      id: "read_text_file",
      name: "read_text_file",
      description: "Read.",
      parameters: {},
      risk: "read",
      source: "native",
    },
  ];

  it("offers the tools whose state is not off, in registry order", () => {
    const offered = offeredTools(
      specs,
      { read_text_file: "ask", list_directory: "on" },
      [],
      [],
      [],
    );
    expect(offered.map((tool) => tool.function.name)).toEqual(["list_directory", "read_text_file"]);
    expect(offered[0].type).toBe("function");
  });

  it("offers nothing when every tool is off", () => {
    expect(offeredTools(specs, { list_directory: "off" }, [], [], [])).toEqual([]);
  });

  it("does not offer a state for a tool the registry does not list", () => {
    expect(offeredTools(specs, { gone: "on" }, [], [], [])).toEqual([]);
  });

  it("tells the file tools which folders are allowed, and leaves the registry alone", () => {
    const offered = offeredTools(
      specs,
      { read_text_file: "ask", list_directory: "on" },
      [],
      [],
      ["C:\\notes", "D:\\docs"],
    );
    expect(offered.map((tool) => tool.function.description)).toEqual([
      "List. Allowed folders: C:\\notes; D:\\docs. Always use full paths inside these folders.",
      "Read. Allowed folders: C:\\notes; D:\\docs. Always use full paths inside these folders.",
    ]);
    expect(specs[0].description).toBe("List.");
  });

  it("says no folder is allowed yet when the list is empty", () => {
    const [offered] = offeredTools(specs, { list_directory: "on" }, [], [], []);
    expect(offered.function.description).toBe("List. No folders are allowed yet.");
  });

  const search: ToolSpec = {
    id: "web_search",
    name: "web_search",
    description: "Search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        source: { type: "string", enum: ["wiki", "hn"], description: "Source to search." },
      },
    },
    risk: "network",
    source: "native",
  };
  const sources = [
    { id: "wiki", label: "Wikipedia", host: "en.wikipedia.org", description: "Facts." },
    { id: "hn", label: "Hacker News", host: "hn.algolia.com", description: "Tech." },
  ];

  it("narrows web_search to the turned-on sources", () => {
    const [offered] = offeredTools([search], { web_search: "on" }, ["hn"], sources, []);
    expect(offered.function.parameters).toMatchObject({ properties: { source: { enum: ["hn"] } } });
  });

  it("does not offer web_search when no source is turned on, even when it is on", () => {
    expect(offeredTools([search], { web_search: "on" }, [], sources, [])).toEqual([]);
  });

  it("does not add the folder notice to web_search", () => {
    const [offered] = offeredTools([search], { web_search: "on" }, ["wiki"], sources, ["C:\\a"]);
    expect(offered.function.description).toBe("Search.");
  });
});

describe("folderNotice", () => {
  it("lists the folders with the full-path rule", () => {
    expect(folderNotice(["C:\\a"])).toBe(
      "Allowed folders: C:\\a. Always use full paths inside these folders.",
    );
  });
});

describe("image results", () => {
  const picture: ToolResultAttachment = {
    path: "C:\\notes\\a.png",
    name: "a.png",
    mime: "image/png",
  };
  const imageResult: ToolResult = {
    ok: true,
    content: "Image a.png (640x480)",
    truncated: false,
    durationMs: 9,
    attachment: picture,
  };

  it("stores the image on the tool row as a file reference, with the result text as content", () => {
    const outcome = {
      ...resultOutcome(imageResult, "auto"),
      attachments: [toolImageRef(picture, "ref-1")],
    };
    const row = buildToolMessage(call("c1", "read_image"), outcome, "row-1", 5);
    expect(row.content).toBe("Image a.png (640x480)");
    expect(row.attachments).toEqual([
      { id: "ref-1", kind: "image", name: "a.png", size: 0, path: "C:\\notes\\a.png" },
    ]);
  });

  it("leaves attachments off a tool row that carries none", () => {
    const row = buildToolMessage(call("c1"), resultOutcome(imageResult, "auto"), "row-1", 5);
    expect(row).not.toHaveProperty("attachments");
  });

  it("turns an image the model may not receive into a failed result with the reason", () => {
    const outcome = noVisionOutcome(imageResult, "once");
    expect(outcome).toEqual({
      status: "error",
      content: TOOL_TEXT.noVision,
      approval: "once",
      durationMs: 9,
      truncated: false,
    });
    expect(outcome).not.toHaveProperty("attachments");
    expect(TOOL_TEXT.noVision).toBe(
      "This model cannot view images (vision is not confirmed for it in the settings scan). Describe the image another way or ask the user to switch model.",
    );
  });
});

describe("toolCallsRefused", () => {
  it("refuses a fresh rejected or accepted result, as the Not supported row does", () => {
    expect(toolCallsRefused([scanEntry({ status: "rejected" })])).toBe(true);
    expect(toolCallsRefused([scanEntry({ status: "accepted" })])).toBe(true);
  });

  it("allows a model that works, and one with no or a stale result", () => {
    expect(toolCallsRefused([scanEntry({ status: "works" })])).toBe(false);
    expect(toolCallsRefused([scanEntry({ status: "rejected", stale: true })])).toBe(false);
    expect(toolCallsRefused([scanEntry({ key: "thinking", status: "rejected" })])).toBe(false);
    expect(toolCallsRefused([])).toBe(false);
  });
});

describe("web results", () => {
  it("shows an offline web result as a failed call, with the reason kept as the result", () => {
    const outcome = resultOutcome(
      {
        ok: false,
        content: "Could not reach the web: connection refused",
        truncated: false,
        durationMs: 40,
      },
      "chat",
    );
    expect(outcome).toEqual({
      status: "error",
      content: "Could not reach the web: connection refused",
      approval: "chat",
      durationMs: 40,
      truncated: false,
    });
  });

  it("answers a search call made with no source on as denied, without running it", () => {
    expect(noSourceOutcome()).toEqual({
      status: "denied",
      content: TOOL_TEXT.noSource,
      approval: "once",
    });
  });
});
