import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreference = vi.fn();
const setPreference = vi.fn();
vi.mock("./database", () => ({
  getPreference: (key: string) => getPreference(key),
  setPreference: (key: string, value: unknown, type: string) => setPreference(key, value, type),
}));

import {
  loadDispatchToolStates,
  loadSearchSourceIds,
  saveDispatchToolState,
  saveSearchSourceIds,
} from "./toolSettings";

describe("Dispatch tool states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only the tools the user set, so the others keep their chat state", async () => {
    getPreference.mockImplementation((key: string) =>
      Promise.resolve(key === "tool_dispatch_state_web_fetch" ? "ask" : null),
    );
    await expect(loadDispatchToolStates(["read_text_file", "web_fetch"])).resolves.toEqual({
      web_fetch: "ask",
    });
    expect(getPreference).toHaveBeenCalledWith("tool_dispatch_state_read_text_file");
  });

  it("reads an invalid saved value as off, the same as the chat states", async () => {
    getPreference.mockResolvedValue("bogus");
    await expect(loadDispatchToolStates(["read_text_file"])).resolves.toEqual({
      read_text_file: "off",
    });
  });

  it("saves under its own preference key, apart from the chat state", async () => {
    setPreference.mockResolvedValue(undefined);
    await saveDispatchToolState("web_fetch", "on");
    expect(setPreference).toHaveBeenCalledWith("tool_dispatch_state_web_fetch", "on", "string");
  });
});

describe("search source preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads no sources when nothing is saved", async () => {
    getPreference.mockResolvedValue(null);
    await expect(loadSearchSourceIds()).resolves.toEqual([]);
    expect(getPreference).toHaveBeenCalledWith("web_search_sources");
  });

  it("reads the saved list of ids", async () => {
    getPreference.mockResolvedValue('["wikipedia","hacker_news"]');
    await expect(loadSearchSourceIds()).resolves.toEqual(["wikipedia", "hacker_news"]);
  });

  it("saves the list as JSON text under the web_search_sources preference", async () => {
    setPreference.mockResolvedValue(undefined);
    await saveSearchSourceIds(["wikipedia"]);
    expect(setPreference).toHaveBeenCalledWith("web_search_sources", '["wikipedia"]', "string");
  });
});
