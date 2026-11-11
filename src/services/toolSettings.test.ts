import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreference = vi.fn();
const setPreference = vi.fn();
vi.mock("./database", () => ({
  getPreference: (key: string) => getPreference(key),
  setPreference: (key: string, value: unknown, type: string) => setPreference(key, value, type),
}));

import { loadSearchSourceIds, saveSearchSourceIds } from "./toolSettings";

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
