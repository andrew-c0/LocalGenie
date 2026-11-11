import { beforeEach, describe, expect, it, vi } from "vitest";

const listTools = vi.fn();
const listSearchSources = vi.fn();
vi.mock("../services/tools", () => ({
  listTools: () => listTools(),
  listSearchSources: () => listSearchSources(),
}));

const loadAllowedFolders = vi.fn();
const loadToolStates = vi.fn();
const saveAllowedFolders = vi.fn();
const saveToolState = vi.fn();
const loadSearchSourceIds = vi.fn();
const saveSearchSourceIds = vi.fn();
vi.mock("../services/toolSettings", () => ({
  loadAllowedFolders: () => loadAllowedFolders(),
  loadToolStates: (names: string[]) => loadToolStates(names),
  loadSearchSourceIds: () => loadSearchSourceIds(),
  saveAllowedFolders: (folders: string[]) => saveAllowedFolders(folders),
  saveSearchSourceIds: (ids: string[]) => saveSearchSourceIds(ids),
  saveToolState: (name: string, state: string) => saveToolState(name, state),
}));

const toastError = vi.fn();
vi.mock("../utils/toast", () => ({
  toast: { error: (title: string, body?: string) => toastError(title, body) },
}));

import type { SearchSourceInfo, ToolSpec } from "../types";
import { useToolStore } from "./toolStore";

const sources: SearchSourceInfo[] = [
  { id: "wikipedia", label: "Wikipedia", host: "en.wikipedia.org", description: "Facts." },
  { id: "hacker_news", label: "Hacker News", host: "hn.algolia.com", description: "Tech." },
];

const specs: ToolSpec[] = [
  {
    id: "list_directory",
    name: "list_directory",
    description: "List a folder.",
    parameters: {},
    risk: "read",
    source: "native",
  },
  {
    id: "read_text_file",
    name: "read_text_file",
    description: "Read a text file.",
    parameters: {},
    risk: "read",
    source: "native",
  },
];

const initialState = {
  states: {},
  allowedFolders: [],
  tools: [],
  searchSources: [],
  enabledSearchSources: [],
  loaded: false,
  loadError: null,
  chatGrants: {},
};

/** A store that has loaded: one folder allowed, one tool on. */
function loadedState() {
  useToolStore.setState({
    ...initialState,
    tools: specs,
    states: { list_directory: "on", read_text_file: "off" },
    allowedFolders: ["C:\\Work"],
    loaded: true,
  });
}

describe("toolStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    saveToolState.mockResolvedValue(undefined);
    saveAllowedFolders.mockResolvedValue(undefined);
    saveSearchSourceIds.mockResolvedValue(undefined);
    listSearchSources.mockResolvedValue([]);
    loadSearchSourceIds.mockResolvedValue([]);
    useToolStore.setState(initialState);
  });

  describe("load", () => {
    it("reads the tools, the saved states, the folders and the search sources", async () => {
      listTools.mockResolvedValue(specs);
      loadAllowedFolders.mockResolvedValue(["C:\\Work"]);
      loadToolStates.mockResolvedValue({ list_directory: "ask", read_text_file: "off" });
      listSearchSources.mockResolvedValue(sources);
      loadSearchSourceIds.mockResolvedValue(["wikipedia"]);

      await useToolStore.getState().load();

      const state = useToolStore.getState();
      expect(loadToolStates).toHaveBeenCalledWith(["list_directory", "read_text_file"]);
      expect(state.tools).toEqual(specs);
      expect(state.states).toEqual({ list_directory: "ask", read_text_file: "off" });
      expect(state.allowedFolders).toEqual(["C:\\Work"]);
      expect(state.searchSources).toEqual(sources);
      expect(state.enabledSearchSources).toEqual(["wikipedia"]);
      expect(state.loaded).toBe(true);
      expect(state.loadError).toBeNull();
    });

    it("stays unloaded when the search sources fail to load, so a retry shows them", async () => {
      const failure = new Error("sources unavailable");
      listTools.mockResolvedValue(specs);
      loadAllowedFolders.mockResolvedValue([]);
      listSearchSources.mockRejectedValue(failure);
      loadSearchSourceIds.mockResolvedValue([]);

      await useToolStore.getState().load();

      expect(useToolStore.getState().loaded).toBe(false);
      expect(useToolStore.getState().loadError).toBe(failure);
    });

    it("keeps the error and stays unloaded when the tool list fails", async () => {
      const failure = "tool registry unavailable";
      listTools.mockRejectedValue(failure);
      loadAllowedFolders.mockResolvedValue([]);

      await useToolStore.getState().load();

      const state = useToolStore.getState();
      expect(state.loaded).toBe(false);
      expect(state.loadError).toBe(failure);
      expect(state.states).toEqual({});
    });

    it("clears the error when a retry starts and then succeeds", async () => {
      useToolStore.setState({ loadError: "old failure" });
      listTools.mockResolvedValue(specs);
      loadAllowedFolders.mockResolvedValue([]);
      loadToolStates.mockResolvedValue({});

      await useToolStore.getState().load();

      expect(useToolStore.getState().loadError).toBeNull();
      expect(useToolStore.getState().loaded).toBe(true);
    });
  });

  describe("setState", () => {
    it("saves the state and shows it", async () => {
      loadedState();

      await useToolStore.getState().setState("read_text_file", "ask");

      expect(saveToolState).toHaveBeenCalledWith("read_text_file", "ask");
      expect(useToolStore.getState().states.read_text_file).toBe("ask");
      expect(useToolStore.getState().states.list_directory).toBe("on");
    });

    it("keeps the old state and shows a toast when the save fails", async () => {
      loadedState();
      saveToolState.mockRejectedValue(new Error("disk full"));

      await useToolStore.getState().setState("list_directory", "off");

      expect(useToolStore.getState().states.list_directory).toBe("on");
      expect(toastError).toHaveBeenCalledWith(
        "Could not save the setting for Listed folder",
        "disk full",
      );
    });
  });

  describe("addFolder", () => {
    it("adds and saves a new absolute folder", async () => {
      loadedState();

      const added = await useToolStore.getState().addFolder("D:\\Notes\\");

      expect(added).toBe(true);
      expect(saveAllowedFolders).toHaveBeenCalledWith(["C:\\Work", "D:\\Notes"]);
      expect(useToolStore.getState().allowedFolders).toEqual(["C:\\Work", "D:\\Notes"]);
    });

    it("does not save a folder that is already allowed", async () => {
      loadedState();

      const added = await useToolStore.getState().addFolder("c:\\work");

      expect(added).toBe(false);
      expect(saveAllowedFolders).not.toHaveBeenCalled();
    });

    it("does not save before the settings have loaded, so saved folders are not overwritten", async () => {
      loadedState();
      useToolStore.setState({ loaded: false, allowedFolders: [] });

      const added = await useToolStore.getState().addFolder("D:\\Notes");

      expect(added).toBe(false);
      expect(saveAllowedFolders).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalled();
    });

    it("keeps the old list when the save fails", async () => {
      loadedState();
      saveAllowedFolders.mockRejectedValue(new Error("locked"));

      const added = await useToolStore.getState().addFolder("D:\\Notes");

      expect(added).toBe(false);
      expect(useToolStore.getState().allowedFolders).toEqual(["C:\\Work"]);
      expect(toastError).toHaveBeenCalledWith("Could not save the allowed folders", "locked");
    });
  });

  describe("removeFolder", () => {
    it("removes and saves the folder", async () => {
      loadedState();
      useToolStore.setState({ allowedFolders: ["C:\\Work", "D:\\Notes"] });

      await useToolStore.getState().removeFolder("C:\\Work\\");

      expect(saveAllowedFolders).toHaveBeenCalledWith(["D:\\Notes"]);
      expect(useToolStore.getState().allowedFolders).toEqual(["D:\\Notes"]);
    });

    it("does nothing for a folder that is not allowed", async () => {
      loadedState();

      await useToolStore.getState().removeFolder("E:\\Other");

      expect(saveAllowedFolders).not.toHaveBeenCalled();
    });

    it("keeps the folder when the save fails", async () => {
      loadedState();
      saveAllowedFolders.mockRejectedValue(new Error("locked"));

      await useToolStore.getState().removeFolder("C:\\Work");

      expect(useToolStore.getState().allowedFolders).toEqual(["C:\\Work"]);
    });

    it("does not save before the settings have loaded", async () => {
      loadedState();
      useToolStore.setState({ loaded: false });

      await useToolStore.getState().removeFolder("C:\\Work");

      expect(saveAllowedFolders).not.toHaveBeenCalled();
    });
  });

  describe("setSourceEnabled", () => {
    /** A loaded store with the two sources and `wikipedia` turned on. */
    function withSources(enabled: string[]) {
      loadedState();
      useToolStore.setState({ searchSources: sources, enabledSearchSources: enabled });
    }

    it("saves the list with the source added, then shows it", async () => {
      withSources(["wikipedia"]);

      await useToolStore.getState().setSourceEnabled("hacker_news", true);

      expect(saveSearchSourceIds).toHaveBeenCalledWith(["wikipedia", "hacker_news"]);
      expect(useToolStore.getState().enabledSearchSources).toEqual(["wikipedia", "hacker_news"]);
    });

    it("saves the list with the source removed when turned off", async () => {
      withSources(["wikipedia", "hacker_news"]);

      await useToolStore.getState().setSourceEnabled("wikipedia", false);

      expect(saveSearchSourceIds).toHaveBeenCalledWith(["hacker_news"]);
      expect(useToolStore.getState().enabledSearchSources).toEqual(["hacker_news"]);
    });

    it("saves nothing when the source is already in that state", async () => {
      withSources(["wikipedia"]);

      await useToolStore.getState().setSourceEnabled("wikipedia", true);

      expect(saveSearchSourceIds).not.toHaveBeenCalled();
    });

    it("keeps the old list and shows a toast when the save fails", async () => {
      withSources(["wikipedia"]);
      saveSearchSourceIds.mockRejectedValue(new Error("locked"));

      await useToolStore.getState().setSourceEnabled("hacker_news", true);

      expect(useToolStore.getState().enabledSearchSources).toEqual(["wikipedia"]);
      expect(toastError).toHaveBeenCalledWith("Could not save the search sources", "locked");
    });

    it("refuses before the settings have loaded, so the saved list is not overwritten", async () => {
      withSources([]);
      useToolStore.setState({ loaded: false });

      await useToolStore.getState().setSourceEnabled("wikipedia", true);

      expect(saveSearchSourceIds).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(
        "Could not change the search source",
        "The tool settings have not loaded yet.",
      );
    });

    it("queues quick toggles so each one starts from the list the last one saved", async () => {
      withSources([]);
      let release: () => void = () => undefined;
      saveSearchSourceIds.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = () => resolve();
          }),
      );

      const first = useToolStore.getState().setSourceEnabled("wikipedia", true);
      const second = useToolStore.getState().setSourceEnabled("hacker_news", true);
      await vi.waitFor(() => expect(saveSearchSourceIds).toHaveBeenCalledTimes(1));
      expect(saveSearchSourceIds).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([first, second]);

      expect(saveSearchSourceIds).toHaveBeenNthCalledWith(1, ["wikipedia"]);
      expect(saveSearchSourceIds).toHaveBeenNthCalledWith(2, ["wikipedia", "hacker_news"]);
      expect(useToolStore.getState().enabledSearchSources).toEqual(["wikipedia", "hacker_news"]);
    });
  });

  describe("chat grants", () => {
    it("grants a tool to one chat only", () => {
      const store = useToolStore.getState();
      store.grantForChat("chat-1", "read_text_file");

      expect(useToolStore.getState().hasChatGrant("chat-1", "read_text_file")).toBe(true);
      expect(useToolStore.getState().hasChatGrant("chat-2", "read_text_file")).toBe(false);
      expect(useToolStore.getState().hasChatGrant("chat-1", "list_directory")).toBe(false);
    });

    it("does not repeat a grant", () => {
      const store = useToolStore.getState();
      store.grantForChat("chat-1", "read_text_file");
      store.grantForChat("chat-1", "read_text_file");

      expect(useToolStore.getState().chatGrants["chat-1"]).toEqual(["read_text_file"]);
    });

    it("clears only the given chat's grants", () => {
      const store = useToolStore.getState();
      store.grantForChat("chat-1", "read_text_file");
      store.grantForChat("chat-2", "read_text_file");

      store.clearChatGrants("chat-1");

      expect(useToolStore.getState().chatGrants).toEqual({ "chat-2": ["read_text_file"] });
    });

    it("never writes grants to the preference table", async () => {
      useToolStore.getState().grantForChat("chat-1", "read_text_file");
      await useToolStore.getState().setState("list_directory", "on");

      expect(saveToolState).toHaveBeenCalledTimes(1);
      expect(saveToolState).toHaveBeenCalledWith("list_directory", "on");
      expect(saveAllowedFolders).not.toHaveBeenCalled();
    });
  });
});
