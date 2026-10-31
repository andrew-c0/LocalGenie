import { create } from "zustand";
import type {
  GenerationSettings,
  ModelInfo,
  SearchModel,
  ServerSettings,
  ServerStatus,
  UpdateInfo,
} from "../types/index.js";

const DEFAULT_PORT = 18181;

/** Default compute target used when the user has not picked one. */
export const DEFAULT_COMPUTE = "npu";

/** Valid compute targets for the `geniex serve --compute` flag. */
export const COMPUTE_TARGETS = ["npu", "gpu", "cpu"] as const;
export type ComputeChoice = (typeof COMPUTE_TARGETS)[number];

interface ModelState {
  cliInstalled: boolean;
  models: ModelInfo[];
  serverStatus: ServerStatus;
  serverPort: number;
  searchResults: SearchModel[];
  isSearching: boolean;
  /** The model currently loaded on the server — single source of truth. */
  activeModelId: string | null;
  /** Result of the latest CLI update check. */
  updateInfo: UpdateInfo | null;
  /** Compute target used when starting the GenieX server. */
  compute: ComputeChoice;
  /** Server-start settings the running server was started with; null when unknown (external) or stopped. */
  serverOptions: ServerSettings | null;
  /** Whether the header model-selector popover is open. */
  selectorOpen: boolean;
  /** Chipset name from the CLI host probe, read once at startup. Null when unknown. */
  chipset: string | null;
  /** Compute target the loaded model was loaded on. Null when no model was loaded by this app. */
  loadedCompute: ComputeChoice | null;
  /** Context window (tokens) the loaded model was loaded with. Null when no model was loaded by this app. */
  loadedContext: number | null;

  setCliInstalled: (v: boolean) => void;
  setChipset: (chipset: string | null) => void;
  setModels: (models: ModelInfo[]) => void;
  setServerStatus: (status: ServerStatus) => void;
  setServerPort: (port: number) => void;
  setActiveModel: (modelId: string | null) => void;
  setSearchResults: (results: SearchModel[]) => void;
  setIsSearching: (v: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setCompute: (c: ComputeChoice) => void;
  setServerOptions: (o: ServerSettings | null) => void;
  setLoadedCompute: (c: ComputeChoice | null) => void;
  setLoadedContext: (n: number | null) => void;
  setSelectorOpen: (open: boolean) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  cliInstalled: false,
  models: [],
  serverStatus: { running: false, port: DEFAULT_PORT, models: [] },
  serverPort: DEFAULT_PORT,
  searchResults: [],
  isSearching: false,
  activeModelId: null,
  updateInfo: null,
  compute: DEFAULT_COMPUTE,
  serverOptions: null,
  selectorOpen: false,
  chipset: null,
  loadedCompute: null,
  loadedContext: null,

  setCliInstalled: (v) => set({ cliInstalled: v }),
  setChipset: (chipset) => set({ chipset }),
  setSelectorOpen: (open: boolean) => set({ selectorOpen: open }),
  setModels: (models) => set({ models }),
  setServerStatus: (status) =>
    set((state) => {
      // Auto-sync activeModelId when server status changes
      const firstModel = status.models.length > 0 ? status.models[0] : null;
      let activeModelId = null;
      if (firstModel) {
        if (state.activeModelId && status.models.includes(state.activeModelId)) {
          activeModelId = state.activeModelId; // keep current if still loaded
        } else {
          activeModelId = firstModel; // otherwise fall back to first loaded
        }
      }
      // Nothing loaded means no compute target to report.
      const loaded = status.models.length > 0;
      return {
        serverStatus: status,
        activeModelId,
        loadedCompute: loaded ? state.loadedCompute : null,
        loadedContext: loaded ? state.loadedContext : null,
      };
    }),
  setServerPort: (port) =>
    set((state) => ({
      serverPort: port,
      serverStatus: { ...state.serverStatus, port },
    })),
  setActiveModel: (modelId) => set({ activeModelId: modelId }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setCompute: (compute) => set({ compute }),
  setServerOptions: (o) => set({ serverOptions: o }),
  setLoadedCompute: (c) => set({ loadedCompute: c }),
  setLoadedContext: (n) => set({ loadedContext: n }),
}));

/** Default generation settings per model. */
export const defaultSettings: GenerationSettings = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repetitionPenalty: 1.1,
  // maxTokens and seed are unset by default: the server's own values apply.
  think: true,
};
