import { create } from "zustand";
import type {
  GenerationSettings,
  ModelInfo,
  SearchModel,
  ServerStatus,
  DownloadProgress,
} from "../types";

const DEFAULT_PORT = 18181;

interface ModelState {
  cliInstalled: boolean;
  models: ModelInfo[];
  serverStatus: ServerStatus;
  serverPort: number;
  downloads: DownloadProgress[];
  searchResults: SearchModel[];
  isSearching: boolean;
  /** The model currently loaded on the server — single source of truth. */
  activeModelId: string | null;

  setCliInstalled: (v: boolean) => void;
  setModels: (models: ModelInfo[]) => void;
  setServerStatus: (status: ServerStatus) => void;
  setServerPort: (port: number) => void;
  setActiveModel: (modelId: string | null) => void;
  addDownload: (progress: DownloadProgress) => void;
  removeDownload: (model: string) => void;
  setSearchResults: (results: SearchModel[]) => void;
  setIsSearching: (v: boolean) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  cliInstalled: false,
  models: [],
  serverStatus: { running: false, port: DEFAULT_PORT, models: [] },
  serverPort: DEFAULT_PORT,
  downloads: [],
  searchResults: [],
  isSearching: false,
  activeModelId: null,

  setCliInstalled: (v) => set({ cliInstalled: v }),
  setModels: (models) => set({ models }),
  setServerStatus: (status) =>
    set((state) => {
      // Auto-sync activeModelId when server status changes
      const firstModel = status.models.length > 0 ? status.models[0] : null;
      const activeModelId = firstModel
        ? state.activeModelId && status.models.includes(state.activeModelId)
          ? state.activeModelId // keep current if still loaded
          : firstModel // otherwise fall back to first loaded
        : null; // nothing loaded → clear
      return { serverStatus: status, activeModelId };
    }),
  setServerPort: (port) =>
    set((state) => ({
      serverPort: port,
      serverStatus: { ...state.serverStatus, port },
    })),
  setActiveModel: (modelId) => set({ activeModelId: modelId }),
  addDownload: (progress) =>
    set((state) => ({
      downloads: [...state.downloads.filter((d) => d.model !== progress.model), progress],
    })),
  removeDownload: (model) =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.model !== model),
    })),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),
}));

/** Default generation settings per model. */
export const defaultSettings: GenerationSettings = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repetitionPenalty: 1.1,
  maxTokens: 2048,
  nctx: 4096,
  systemPrompt: "",
  think: true,
};
