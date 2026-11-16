import { beforeEach, describe, expect, it, vi } from "vitest";

// The database is an in-memory preference table. A read returns the value as it was when the read started,
// like a query does. A test can hold the reads open to change a setting while the load is still reading.
const prefs = new Map<string, unknown>();
/** The per-tool state keys, the reads a load makes for each tool. */
function isStateKey(key: string): boolean {
  return key.startsWith("tool_state_") || key.startsWith("tool_dispatch_state_");
}
let heldReads: { started: () => void; gate: Promise<void> } | null = null;
vi.mock("../services/database", () => ({
  getPreference: async (key: string) => {
    const value = prefs.get(key) ?? null;
    if (isStateKey(key) && heldReads) {
      heldReads.started();
      await heldReads.gate;
    }
    return value;
  },
  setPreference: (key: string, value: unknown) => {
    prefs.set(key, value);
    return Promise.resolve();
  },
}));

const listTools = vi.fn();
vi.mock("../services/tools", () => ({
  listTools: () => listTools(),
  listSearchSources: () => Promise.resolve([]),
}));

vi.mock("../utils/toast", () => ({
  toast: { error: () => undefined },
}));

import type { ToolSpec } from "../types";
import { useToolStore } from "./toolStore";

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
  dispatchStates: {},
  allowedFolders: [],
  tools: [],
  searchSources: [],
  enabledSearchSources: [],
  loaded: false,
  loadError: null,
  chatGrants: {},
  chatDisabled: {},
};

/** Holds the tool reads of the next load open. `started` resolves once a read has taken its value. */
function holdReads(): { started: Promise<void>; release: () => void } {
  let signalStarted: () => void = () => undefined;
  let release: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  heldReads = { started: () => signalStarted(), gate };
  return { started, release };
}

describe("tool states across a restart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    prefs.clear();
    heldReads = null;
    listTools.mockResolvedValue(specs);
    useToolStore.setState(initialState);
  });

  it("reads back the Dispatch and chat states, each from its own key", async () => {
    await useToolStore.getState().setState("list_directory", "ask");
    await useToolStore.getState().setDispatchState("list_directory", "on");
    await useToolStore.getState().setDispatchState("read_text_file", "off");

    // A restart: the store starts empty and loads what was saved.
    useToolStore.setState(initialState);
    await useToolStore.getState().load();

    const state = useToolStore.getState();
    expect(state.states).toEqual({ list_directory: "ask", read_text_file: "off" });
    expect(state.dispatchStates).toEqual({ list_directory: "on", read_text_file: "off" });
  });

  it("keeps a Dispatch state set while the load is still reading the saved ones", async () => {
    const hold = holdReads();
    const loading = useToolStore.getState().load();
    await hold.started;

    await useToolStore.getState().setDispatchState("list_directory", "on");
    hold.release();
    await loading;

    expect(useToolStore.getState().dispatchStates).toEqual({ list_directory: "on" });
  });

  it("keeps a chat state set while the load is still reading the saved ones", async () => {
    const hold = holdReads();
    const loading = useToolStore.getState().load();
    await hold.started;

    await useToolStore.getState().setState("read_text_file", "ask");
    hold.release();
    await loading;

    expect(useToolStore.getState().states.read_text_file).toBe("ask");
  });
});
