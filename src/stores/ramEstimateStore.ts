import { create } from "zustand";
import { loadStoredRam } from "../services/modelRam";
import type { StoredRam } from "../utils/modelRam";

interface RamEstimateState {
  /** The RAM stored with each downloaded model, keyed by the model's settings key. */
  ramByModel: Record<string, StoredRam>;
  /** Reads the stored figures again. A failed read keeps what is shown. */
  refresh: () => Promise<void>;
}

/** Tail of the read queue: each read starts when the one before it has ended. */
let queue: Promise<void> = Promise.resolve();

/**
 * The per-model RAM the model selector shows. The figures are stored with the downloaded model (set
 * when it is imported and when its context setting is saved), so a read is one database query. Read
 * again when the local model list changes and after a model's settings are saved.
 */
export const useRamEstimateStore = create<RamEstimateState>((set) => ({
  ramByModel: {},
  refresh: () => {
    const read = queue.then(async () => {
      try {
        set({ ramByModel: await loadStoredRam() });
      } catch (err) {
        console.warn("[models] RAM figures unavailable:", err);
      }
    });
    queue = read;
    return read;
  },
}));
