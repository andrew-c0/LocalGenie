import { create } from "zustand";
import type {
  ImageSize,
  InputImage,
  OcrCompute,
  OcrComputeSettings,
  OcrJob,
  OcrMode,
  OcrModel,
  OcrResult,
  OcrVisionCompute,
} from "../types";
import { DEFAULT_OCR_COMPUTE, defaultOcrModel } from "../utils/ocr";

/**
 * OCR state, kept across page visits: the catalog, the selected model and mode, the input picture,
 * the compute choices, the running job and the last result. Downloads stay in the Playground store,
 * since their events carry only a model id. The listeners and service calls live outside the store.
 */
interface OcrState {
  /** Null until the catalog has been read. */
  models: OcrModel[] | null;
  selectedModelId: string | null;
  mode: OcrMode;
  input: InputImage | null;
  settings: OcrComputeSettings;
  job: OcrJob | null;
  result: OcrResult | null;

  /** Replace the catalog. The selection stays when its model is still listed, else a default is chosen. */
  setModels: (models: OcrModel[]) => void;
  /** Replace the catalog after a delete. The deleted model is not selected again. */
  replaceModelsAfterDelete: (models: OcrModel[], deletedModelId: string) => void;
  selectModel: (modelId: string) => void;
  setMode: (mode: OcrMode) => void;
  setInput: (input: InputImage) => void;
  setInputSize: (size: ImageSize) => void;
  setCompute: (compute: OcrCompute) => void;
  setVisionCompute: (visionCompute: OcrVisionCompute) => void;

  /** Start a job and clear the previous result. */
  startJob: (job: OcrJob) => void;
  /** Store the result of the running job. A result for any other job is ignored. */
  finishJob: (result: OcrResult) => void;
}

export const useOcrStore = create<OcrState>((set) => ({
  models: null,
  selectedModelId: null,
  mode: "text",
  input: null,
  settings: DEFAULT_OCR_COMPUTE,
  job: null,
  result: null,

  setModels: (models) =>
    set((state) => {
      if (state.selectedModelId && models.some((m) => m.id === state.selectedModelId)) {
        return { models };
      }
      return { models, selectedModelId: defaultOcrModel(models)?.id ?? null };
    }),

  replaceModelsAfterDelete: (models, deletedModelId) =>
    set((state) => ({
      models,
      selectedModelId: state.selectedModelId === deletedModelId ? null : state.selectedModelId,
    })),

  selectModel: (modelId) => set({ selectedModelId: modelId }),

  setMode: (mode) => set({ mode }),

  setInput: (input) => set({ input }),

  setInputSize: (size) =>
    set((state) => (state.input ? { input: { ...state.input, sourceSize: size } } : {})),

  setCompute: (compute) => set((state) => ({ settings: { ...state.settings, compute } })),

  setVisionCompute: (visionCompute) =>
    set((state) => ({ settings: { ...state.settings, visionCompute } })),

  startJob: (job) => set({ job, result: null }),

  finishJob: (result) =>
    set((state) => {
      if (!state.job || state.job.jobId !== result.jobId) return {};
      return { job: null, result };
    }),
}));
