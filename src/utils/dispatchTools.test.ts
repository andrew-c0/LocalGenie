import { describe, expect, it } from "vitest";
import type { ToolSpec } from "../types";
import {
  ASKS_BEFORE_USE_NOTE,
  allowedToolNames,
  conversationMayUse,
  conversationToolsLabel,
  cutNotes,
  DISPATCH_DEFAULT_STATE,
  DISPATCH_NOTES,
  DISPATCH_OFF_REASON,
  dispatchStateOf,
  dispatchToolNote,
  effectiveDispatchStates,
  isDispatchTool,
  NOTES_MAX_CHARS,
  NOTES_TOOL,
  parseNotesCall,
  riskWarning,
} from "./dispatchTools";

function spec(name: string, risk: ToolSpec["risk"] = "read"): ToolSpec {
  return { id: name, name, description: "", parameters: {}, risk, source: "native" };
}

describe("NOTES_TOOL", () => {
  it("is the one notes tool, with its required text argument", () => {
    expect(NOTES_TOOL.type).toBe("function");
    expect(NOTES_TOOL.function.name).toBe(DISPATCH_NOTES);
    expect(NOTES_TOOL.function.parameters.required).toEqual(["text"]);
  });

  it("recognises only its own name", () => {
    expect(isDispatchTool("dispatch_notes")).toBe(true);
    expect(isDispatchTool("dispatch_ask")).toBe(false);
    expect(isDispatchTool("read_text_file")).toBe(false);
  });
});

describe("parseNotesCall", () => {
  it("reads the text argument", () => {
    expect(parseNotesCall({ arguments: '{"text":"1. read"}' })).toEqual({
      ok: true,
      text: "1. read",
    });
  });

  it("keeps an empty text, so the notes can be cleared", () => {
    expect(parseNotesCall({ arguments: '{"text":""}' })).toEqual({ ok: true, text: "" });
  });

  it("is a failed result that names the argument when it is missing or not text", () => {
    expect(parseNotesCall({ arguments: "{}" })).toEqual({
      ok: false,
      error: 'Invalid arguments for dispatch_notes: expected a "text" text.',
    });
    expect(parseNotesCall({ arguments: "not json" }).ok).toBe(false);
  });
});

describe("cutNotes", () => {
  it("keeps short text as it is", () => {
    expect(cutNotes("plan")).toBe("plan");
  });

  it("cuts the text to the notes limit by characters", () => {
    const long = "a".repeat(NOTES_MAX_CHARS + 20);
    expect(cutNotes(long)).toHaveLength(NOTES_MAX_CHARS);
  });
});

describe("conversationMayUse", () => {
  it("offers a tool that is On or Request approval when the conversation has it switched on", () => {
    expect(conversationMayUse("on", true)).toBe(true);
    expect(conversationMayUse("ask", true)).toBe(true);
  });

  it("does not offer a tool that is switched off here, whatever its state", () => {
    expect(conversationMayUse("on", false)).toBe(false);
    expect(conversationMayUse("ask", false)).toBe(false);
  });

  it("never offers an Off tool, even when switched on here", () => {
    expect(conversationMayUse("off", true)).toBe(false);
  });
});

describe("dispatchStateOf", () => {
  it("uses the Dispatch state the user set, whatever else is saved", () => {
    expect(dispatchStateOf("web_fetch", { web_fetch: "ask" })).toBe("ask");
    expect(dispatchStateOf("web_fetch", { web_fetch: "off" })).toBe("off");
    expect(dispatchStateOf("web_fetch", { web_fetch: "on" })).toBe("on");
  });

  it("is On for a tool the user has not set in Dispatch, so a chat Off or Request approval does not reach it", () => {
    expect(dispatchStateOf("read_text_file", {})).toBe("on");
    expect(DISPATCH_DEFAULT_STATE).toBe("on");
  });
});

describe("effectiveDispatchStates", () => {
  it("gives every listed tool its Dispatch state, On where none is set", () => {
    expect(effectiveDispatchStates(["a", "b", "c"], { b: "off" })).toEqual({
      a: "on",
      b: "off",
      c: "on",
    });
  });
});

describe("dispatchToolNote", () => {
  it("says how to turn an Off tool on, and that a Request approval tool asks", () => {
    expect(dispatchToolNote("off")).toBe(DISPATCH_OFF_REASON);
    expect(dispatchToolNote("ask")).toBe(ASKS_BEFORE_USE_NOTE);
    expect(dispatchToolNote("on")).toBeNull();
  });
});

describe("allowedToolNames", () => {
  const tools = [spec("a"), spec("b"), spec("c")];

  it("records the tools On or Request approval in the Dispatch states, not switched off in the draft", () => {
    const states = { a: "on", b: "on", c: "ask" } as const;
    expect(allowedToolNames(tools, states, ["b"])).toEqual(["a", "c"]);
  });

  it("records nothing for a tool with no saved state (Off)", () => {
    expect(allowedToolNames(tools, { a: "on" }, [])).toEqual(["a"]);
  });
});

describe("riskWarning", () => {
  const tools = [spec("read_file", "read"), spec("fetch", "network"), spec("list", "read")];

  it("is shown when a read tool and a network tool are both offered", () => {
    expect(riskWarning(tools, ["read_file", "fetch"])).toBe(true);
  });

  it("is not shown with only one of the two kinds", () => {
    expect(riskWarning(tools, ["read_file", "list"])).toBe(false);
    expect(riskWarning(tools, ["fetch"])).toBe(false);
  });
});

describe("conversationToolsLabel", () => {
  it("names the count of active tools", () => {
    expect(conversationToolsLabel(3)).toBe("Tools for this conversation, 3 active");
  });
});
