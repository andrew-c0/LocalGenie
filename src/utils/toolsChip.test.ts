import { describe, expect, it } from "vitest";
import type { SearchSourceInfo, ToolSpec } from "../types";
import { ASKS_BEFORE_USE_NOTE, DISPATCH_OFF_REASON } from "./dispatchTools";
import type { ToolState } from "./toolAccess";
import { checkedCount, type ToolEntrySettings, toolEntriesOf } from "./toolsChip";

function spec(name: string, risk: ToolSpec["risk"] = "read"): ToolSpec {
  return { id: name, name, description: "", parameters: {}, risk, source: "native" };
}

const wikipedia: SearchSourceInfo = {
  id: "wikipedia",
  label: "Wikipedia",
  host: "en.wikipedia.org",
  description: "Facts.",
};

const chatSettings: ToolEntrySettings = {
  isDispatch: false,
  states: {},
  enabledSearchSources: [],
  searchSources: [wikipedia],
  disabled: [],
};

function entriesFor(
  tools: ToolSpec[],
  states: Record<string, ToolState>,
  overrides: Partial<ToolEntrySettings> = {},
) {
  return toolEntriesOf(tools, { ...chatSettings, states, ...overrides });
}

describe("toolEntriesOf for a chat", () => {
  const tools = [spec("list_directory"), spec("read_text_file"), spec("web_fetch", "network")];
  const states: Record<string, ToolState> = {
    list_directory: "on",
    read_text_file: "ask",
    web_fetch: "on",
  };

  it("counts every listed tool when none is switched off for the chat", () => {
    expect(checkedCount(entriesFor(tools, states))).toBe(3);
  });

  it("leaves out the tools switched off for the chat", () => {
    expect(checkedCount(entriesFor(tools, states, { disabled: ["read_text_file"] }))).toBe(2);
  });

  it("ignores a switched-off name that is not listed", () => {
    expect(checkedCount(entriesFor(tools, states, { disabled: ["not_a_tool"] }))).toBe(3);
  });

  it("gives the state text as the popover shows it", () => {
    const entries = entriesFor(tools, states);
    expect(entries.map((entry) => entry.stateText)).toEqual(["On", "Asks first", "On"]);
  });

  it("gives no reason, since a chat has nobody to approve for it", () => {
    expect(entriesFor(tools, states).every((entry) => entry.reason === null)).toBe(true);
  });
});

describe("toolEntriesOf and web search", () => {
  const search = spec("web_search", "network");

  it("does not count web_search when no search source is on", () => {
    const entries = entriesFor([spec("list_directory"), search], {
      list_directory: "on",
      web_search: "on",
    });
    expect(checkedCount(entries)).toBe(1);
    expect(entries[1]).toMatchObject({ available: false, checked: false });
    expect(entries[1]?.stateText).toBe("No search source on");
  });

  it("counts web_search once a search source is on", () => {
    const entries = entriesFor(
      [spec("list_directory"), search],
      { list_directory: "on", web_search: "on" },
      { enabledSearchSources: ["wikipedia"] },
    );
    expect(checkedCount(entries)).toBe(2);
  });

  it("does not count web_search when the only saved source is one the backend no longer offers", () => {
    const entries = entriesFor([search], { web_search: "on" }, { enabledSearchSources: ["gone"] });
    expect(checkedCount(entries)).toBe(0);
  });
});

describe("toolEntriesOf for a Dispatch conversation", () => {
  const dispatch = { ...chatSettings, isDispatch: true };

  it("uses a tool that is On or Request approval, and leaves out one that is Off", () => {
    const tools = [spec("read_text_file"), spec("fetch_page", "network"), spec("list_directory")];
    const entries = toolEntriesOf(tools, {
      ...dispatch,
      states: { read_text_file: "on", fetch_page: "ask", list_directory: "off" },
    });
    expect(entries.map((entry) => entry.available)).toEqual([true, true, false]);
    expect(checkedCount(entries)).toBe(2);
  });

  it("does not disable a Request approval tool, and notes that it asks before each use", () => {
    const entries = toolEntriesOf([spec("fetch_page", "network")], {
      ...dispatch,
      states: { fetch_page: "ask" },
    });
    expect(entries[0]).toMatchObject({
      available: true,
      checked: true,
      stateText: "Asks first",
      reason: ASKS_BEFORE_USE_NOTE,
    });
  });

  it("disables an Off tool and says to change it in the Dispatch settings", () => {
    const entries = toolEntriesOf([spec("fetch_page", "network")], {
      ...dispatch,
      states: { fetch_page: "off" },
    });
    expect(entries[0]).toMatchObject({
      available: false,
      checked: false,
      reason: DISPATCH_OFF_REASON,
    });
  });

  it("gives an On tool no reason", () => {
    const entries = toolEntriesOf([spec("read_text_file")], {
      ...dispatch,
      states: { read_text_file: "on" },
    });
    expect(entries[0]?.reason).toBeNull();
  });

  it("leaves out a tool switched off for this conversation, and keeps its switch enabled", () => {
    const entries = toolEntriesOf([spec("read_text_file")], {
      ...dispatch,
      states: { read_text_file: "on" },
      disabled: ["read_text_file"],
    });
    expect(entries[0]).toMatchObject({ available: true, checked: false });
  });

  it("gives a chat row no reason, even for a Request approval tool", () => {
    const entries = entriesFor([spec("fetch_page", "network")], { fetch_page: "ask" });
    expect(entries[0]?.reason).toBeNull();
  });
});
