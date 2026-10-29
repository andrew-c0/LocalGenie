import { create } from "zustand";
import type {
  ImageForm,
  ImageJob,
  ImageModel,
  ImageResult,
  PlaygroundDevice,
  PlaygroundDownloadProgress,
  PlaygroundDownloadState,
  PlaygroundImageProgress,
} from "../types";
import {
  applyModelDefaults,
  DEFAULT_IMAGE_FORM,
  defaultImageModel,
  keepDeviceSelection,
} from "../utils/playground";

/**
 * Playground state, kept across page visits. It holds the model catalog, the selection, the form,
 * model downloads, the running generation and the last result. The event listeners and the service
 * calls live outside the store (`PlaygroundRuntime` and the panel hooks).
 */
interface PlaygroundState {
  /** Null until the catalog has been read. */
  models: ImageModel[] | null;
  selectedModelId: string | null;
  /** Compute devices the runtime reported. Null until they are read. */
  devices: PlaygroundDevice[] | null;
  form: ImageForm;
  /** Downloads started in this session, keyed by model id. A finished download is removed. */
  downloads: Record<string, PlaygroundDownloadState>;
  job: ImageJob | null;
  result: ImageResult | null;

  /** Replace the catalog. The selection stays when its model is still listed, else a default is chosen. */
  setModels: (models: ImageModel[]) => void;
  /** Replace the catalog after a delete. The deleted model is not selected again, and no default is chosen. */
  replaceModelsAfterDelete: (models: ImageModel[], deletedModelId: string) => void;
  /** Store the devices. A selected device that is no longer listed falls back to auto. */
  setDevices: (devices: PlaygroundDevice[]) => void;
  /** Select a model and take its size, steps and CFG scale as the form's values. */
  selectModel: (model: ImageModel) => void;
  setForm: (patch: Partial<ImageForm>) => void;
  /** Fill the form seed with a seed from a result and turn random seeds off. */
  applySeed: (seed: number) => void;

  startDownload: (modelId: string) => void;
  setDownloadProgress: (progress: PlaygroundDownloadProgress) => void;
  markDownloadCancelled: (modelId: string) => void;
  failDownload: (modelId: string, error: string) => void;
  clearDownload: (modelId: string) => void;

  /** Start a job and clear the previous result. */
  startJob: (job: ImageJob) => void;
  setJobProgress: (progress: PlaygroundImageProgress) => void;
  /** Store the result of the running job, with the job's device. A result for any other job is ignored. */
  finishJob: (result: Omit<ImageResult, "device">) => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  models: null,
  selectedModelId: null,
  devices: null,
  form: DEFAULT_IMAGE_FORM,
  downloads: {},
  job: null,
  result: null,

  setModels: (models) =>
    set((state) => {
      if (state.selectedModelId && models.some((m) => m.id === state.selectedModelId)) {
        return { models };
      }
      const fallback = defaultImageModel(models);
      return {
        models,
        selectedModelId: fallback?.id ?? null,
        form: fallback ? applyModelDefaults(state.form, fallback.defaults) : state.form,
      };
    }),

  replaceModelsAfterDelete: (models, deletedModelId) =>
    set((state) => ({
      models,
      selectedModelId: state.selectedModelId === deletedModelId ? null : state.selectedModelId,
    })),

  setDevices: (devices) =>
    set((state) => ({
      devices,
      form: { ...state.form, device: keepDeviceSelection(state.form.device, devices) },
    })),

  selectModel: (model) =>
    set((state) => ({
      selectedModelId: model.id,
      form: applyModelDefaults(state.form, model.defaults),
    })),

  setForm: (patch) => set((state) => ({ form: { ...state.form, ...patch } })),

  applySeed: (seed) => set((state) => ({ form: { ...state.form, seed, randomSeed: false } })),

  startDownload: (modelId) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [modelId]: { status: "downloading", progress: null, error: null },
      },
    })),

  setDownloadProgress: (progress) =>
    set((state) => {
      const current = state.downloads[progress.modelId];
      // Late progress after a cancel must not turn the card back into a running download.
      if (current?.status !== "downloading") return {};
      return {
        downloads: {
          ...state.downloads,
          [progress.modelId]: { ...current, progress },
        },
      };
    }),

  markDownloadCancelled: (modelId) =>
    set((state) => {
      const current = state.downloads[modelId];
      if (!current) return {};
      return {
        downloads: {
          ...state.downloads,
          [modelId]: { ...current, status: "cancelled", error: null },
        },
      };
    }),

  failDownload: (modelId, error) =>
    set((state) => {
      const current = state.downloads[modelId];
      if (!current) return {};
      return {
        downloads: {
          ...state.downloads,
          [modelId]: { ...current, status: "error", error },
        },
      };
    }),

  clearDownload: (modelId) =>
    set((state) => {
      const downloads = { ...state.downloads };
      delete downloads[modelId];
      return { downloads };
    }),

  startJob: (job) => set({ job, result: null }),

  setJobProgress: (progress) =>
    set((state) => {
      const job = state.job;
      if (!job || job.jobId !== progress.jobId) return {};
      return {
        job: {
          ...job,
          phase: progress.phase,
          step: progress.step,
          steps: progress.steps,
          secondsPerStep: progress.secondsPerStep,
        },
      };
    }),

  finishJob: (result) =>
    set((state) => {
      const job = state.job;
      if (!job || job.jobId !== result.jobId) return {};
      return { job: null, result: { ...result, device: job.device } };
    }),
}));
