import { create } from "zustand";
import {
  loadAllowedFolders,
  loadSearchSourceIds,
  loadToolStates,
  saveAllowedFolders,
  saveSearchSourceIds,
  saveToolState,
} from "../services/toolSettings";
import { listSearchSources, listTools } from "../services/tools";
import type { SearchSourceInfo, ToolSpec } from "../types";
import { errorMessage } from "../utils/errorMessage";
import { toast } from "../utils/toast";
import { addAllowedFolder, removeAllowedFolder, type ToolState } from "../utils/toolAccess";
import { toolLabel } from "../utils/toolLines";
import { toggleSource } from "../utils/webSearchSources";

interface ToolStoreState {
  /** The saved state of each tool, by name. A tool missing from the map is off. */
  states: Record<string, ToolState>;
  /** The absolute folders the file tools may read. Empty until loaded. */
  allowedFolders: string[];
  /** The tools the backend knows, from `tool_list`. Empty until loaded. */
  tools: ToolSpec[];
  /** The web search sources the backend offers, from `web_search_sources`. Empty until loaded. */
  searchSources: SearchSourceInfo[];
  /** The ids of the search sources the user turned on. An id the source list no longer has is ignored when used. */
  enabledSearchSources: string[];
  /** True once the tool list, the states, the folders and the search sources have all been read. Writes wait for it. */
  loaded: boolean;
  /** The first-load failure, kept as the raw error. Null when the last load worked or has not failed. */
  loadError: unknown;
  /** Tools a chat was granted under "Request approval". In memory only: a restart forgets them. */
  chatGrants: Record<string, string[]>;
  /**
   * Tools switched off for one chat, by session id. A chat's tools are on unless listed here. In memory
   * only, like `chatGrants`: a restart turns them back on.
   */
  chatDisabled: Record<string, string[]>;
  /** Reads the tool list, the saved states, the folders and the search sources. Safe to call again to retry. */
  load: () => Promise<void>;
  /**
   * Re-reads only the tool list, for when an MCP server starts or stops. States already known are kept;
   * a new tool gets its saved state. A failure is logged and the old list stays.
   */
  refreshTools: () => Promise<void>;
  /** Saves one tool's state, then shows it. A failed save keeps the old state and shows a toast. */
  setState: (name: string, state: ToolState) => Promise<void>;
  /** Adds a folder and saves the list. Resolves to true when the folder was added. */
  addFolder: (path: string) => Promise<boolean>;
  /** Removes a folder and saves the list. */
  removeFolder: (path: string) => Promise<void>;
  /** Turns one search source on or off and saves the list. Writes queue, so quick toggles all stick. */
  setSourceEnabled: (id: string, on: boolean) => Promise<void>;
  /** Records that the chat may run this tool without asking again. */
  grantForChat: (sessionId: string, toolName: string) => void;
  hasChatGrant: (sessionId: string, toolName: string) => boolean;
  /** Forgets a chat's grants. Called by `clearChatToolSettings` when the chat is deleted. */
  clearChatGrants: (sessionId: string) => void;
  /** Turns a tool on or off for one chat. Other chats and the global state are not changed. */
  setChatToolEnabled: (sessionId: string, toolName: string, enabled: boolean) => void;
  /** True unless the tool is switched off for this chat. */
  isToolEnabledInChat: (sessionId: string, toolName: string) => boolean;
  /** Forgets a chat's per-chat tool settings and its grants, when the chat is deleted. */
  clearChatToolSettings: (sessionId: string) => void;
}

/** Tool settings: each tool's state, the folders the file tools may read, the search sources and per-chat grants. */
export const useToolStore = create<ToolStoreState>((set, get) => ({
  states: {},
  allowedFolders: [],
  tools: [],
  searchSources: [],
  enabledSearchSources: [],
  loaded: false,
  loadError: null,
  chatGrants: {},
  chatDisabled: {},

  load: async () => {
    set({ loadError: null });
    try {
      const [tools, allowedFolders, searchSources, enabledSearchSources] = await Promise.all([
        listTools(),
        loadAllowedFolders(),
        listSearchSources(),
        loadSearchSourceIds(),
      ]);
      const states = await loadToolStates(tools.map((tool) => tool.name));
      set({
        tools,
        allowedFolders,
        searchSources,
        enabledSearchSources,
        states,
        loaded: true,
        loadError: null,
      });
    } catch (err) {
      console.warn("[tools] Tool settings unavailable:", err);
      set({ loaded: false, loadError: err });
    }
  },

  refreshTools: async () => {
    try {
      const tools = await listTools();
      const fresh = await loadToolStates(tools.map((tool) => tool.name));
      set((current) => ({ tools, states: { ...fresh, ...current.states } }));
    } catch (err) {
      console.warn("[tools] Tool list refresh failed:", err);
    }
  },

  setState: async (name, state) => {
    try {
      await saveToolState(name, state);
    } catch (err) {
      toast.error(`Could not save the setting for ${toolLabel(name)}`, errorMessage(err));
      return;
    }
    set((current) => ({ states: { ...current.states, [name]: state } }));
  },

  addFolder: async (path) => {
    const { allowedFolders, loaded } = get();
    if (!loaded) {
      toast.error("Could not add the folder", "The tool settings have not loaded yet.");
      return false;
    }
    const next = addAllowedFolder(allowedFolders, path);
    if (next === allowedFolders) return false;
    return saveFolders(next, set);
  },

  removeFolder: async (path) => {
    const { allowedFolders, loaded } = get();
    if (!loaded) {
      toast.error("Could not remove the folder", "The tool settings have not loaded yet.");
      return;
    }
    const next = removeAllowedFolder(allowedFolders, path);
    if (next.length === allowedFolders.length) return;
    await saveFolders(next, set);
  },

  setSourceEnabled: (id, on) => {
    const write = sourceWrites.then(() => writeSourceEnabled(id, on, get, set));
    sourceWrites = write;
    return write;
  },

  grantForChat: (sessionId, toolName) => {
    if (get().hasChatGrant(sessionId, toolName)) return;
    set((current) => ({
      chatGrants: {
        ...current.chatGrants,
        [sessionId]: [...(current.chatGrants[sessionId] ?? []), toolName],
      },
    }));
  },

  hasChatGrant: (sessionId, toolName) => (get().chatGrants[sessionId] ?? []).includes(toolName),

  clearChatGrants: (sessionId) => {
    set((current) => {
      const { [sessionId]: _cleared, ...rest } = current.chatGrants;
      return { chatGrants: rest };
    });
  },

  setChatToolEnabled: (sessionId, toolName, enabled) => {
    set((current) => {
      const others = (current.chatDisabled[sessionId] ?? []).filter((name) => name !== toolName);
      const disabled = enabled ? others : [...others, toolName];
      const { [sessionId]: _previous, ...rest } = current.chatDisabled;
      return { chatDisabled: disabled.length > 0 ? { ...rest, [sessionId]: disabled } : rest };
    });
  },

  isToolEnabledInChat: (sessionId, toolName) =>
    !(get().chatDisabled[sessionId] ?? []).includes(toolName),

  clearChatToolSettings: (sessionId) => {
    get().clearChatGrants(sessionId);
    set((current) => {
      const { [sessionId]: _cleared, ...rest } = current.chatDisabled;
      return { chatDisabled: rest };
    });
  },
}));

/** The last search source write. Each new write waits for it, so every write starts from the list the last one saved. */
let sourceWrites: Promise<void> = Promise.resolve();

type StoreSetter = (partial: Partial<ToolStoreState>) => void;

/** Saves the folder list and shows it. A failed save keeps the old list. Resolves to whether it saved. */
async function saveFolders(next: string[], set: StoreSetter): Promise<boolean> {
  try {
    await saveAllowedFolders(next);
  } catch (err) {
    toast.error("Could not save the allowed folders", errorMessage(err));
    return false;
  }
  set({ allowedFolders: next });
  return true;
}

/**
 * Turns one search source on or off: saves the new list, then shows it. Refuses until the settings have
 * loaded, so a save never overwrites the saved list with an empty one. Never rejects.
 */
async function writeSourceEnabled(
  id: string,
  on: boolean,
  get: () => ToolStoreState,
  set: StoreSetter,
): Promise<void> {
  const { enabledSearchSources, loaded } = get();
  if (!loaded) {
    toast.error("Could not change the search source", "The tool settings have not loaded yet.");
    return;
  }
  const next = toggleSource(enabledSearchSources, id, on);
  if (next === enabledSearchSources) return;
  try {
    await saveSearchSourceIds(next);
  } catch (err) {
    toast.error("Could not save the search sources", errorMessage(err));
    return;
  }
  set({ enabledSearchSources: next });
}
