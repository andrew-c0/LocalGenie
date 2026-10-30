import { create } from "zustand";
import type {
  ImageForm,
  ImageJob,
  ImageModel,
  ImageOutcome,
  ImageResult,
  ImageSize,
  InputImage,
  PlaygroundDevice,
  PlaygroundDownloadProgress,
  PlaygroundDownloadState,
  PlaygroundImageProgress,
  UpscaleModel,
} from "../types";
import {
  clampStrength,
  DEFAULT_STRENGTH,
  formWithInputSize,
  isImageToImageModel,
} from "../utils/imageToImage";
import {
  applyModelDefaults,
  DEFAULT_IMAGE_FORM,
  defaultImageModel,
  keepDeviceSelection,
} from "../utils/playground";
import { defaultUpscaleModel } from "../utils/upscale";

/**
 * Playground state, kept across page visits. It holds the model catalog, the selection, the form,
 * the image to image input, model downloads, the running generation and the last result (text to image, image to image and upscaling share one job slot). The event
 * listeners and the service calls live outside the store (`PlaygroundRuntime` and the panel hooks).
 */
interface PlaygroundState {
  /** Null until the catalog has been read. */
  models: ImageModel[] | null;
  selectedModelId: string | null;
  /** Compute devices the runtime reported. Null until they are read. */
  devices: PlaygroundDevice[] | null;
  form: ImageForm;
  /** The picture image to image edits. Null until one is picked. */
  inputImage: InputImage | null;
  /** How far a re-draw model moves away from the input picture. */
  strength: number;
  /** Downloads started in this session, keyed by model id. A finished download is removed. */
  downloads: Record<string, PlaygroundDownloadState>;
  /** Upscaling models. Null until the catalog has been read. */
  upscaleModels: UpscaleModel[] | null;
  upscaleModelId: string | null;
  /** The picture Image upscaling works on. Null until one is picked. */
  upscaleInput: InputImage | null;
  /** The running image job of any tab; `job.kind` says which tab shows it. */
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

  /** Pick the input picture. Its size is not known until its preview has loaded. */
  setInputImage: (input: InputImage) => void;
  /** Store the input picture's pixel size and set the form's size from it, for the selected model. */
  setInputSourceSize: (size: ImageSize) => void;
  setStrength: (strength: number) => void;
  /** Select a model for image to image: its defaults, with the size taken from the input picture. */
  selectEditModel: (model: ImageModel) => void;

  /** Replace the upscaling catalog. The selection stays when its model is still listed, else a default is chosen. */
  setUpscaleModels: (models: UpscaleModel[]) => void;
  /** Replace the upscaling catalog after a delete. The deleted model is not selected again. */
  replaceUpscaleModelsAfterDelete: (models: UpscaleModel[], deletedModelId: string) => void;
  selectUpscaleModel: (modelId: string) => void;
  /** Pick the upscale input picture. Its size is not known until its preview has loaded. */
  setUpscaleInput: (input: InputImage) => void;
  setUpscaleInputSize: (size: ImageSize) => void;

  startDownload: (modelId: string) => void;
  setDownloadProgress: (progress: PlaygroundDownloadProgress) => void;
  markDownloadCancelled: (modelId: string) => void;
  failDownload: (modelId: string, error: string) => void;
  clearDownload: (modelId: string) => void;

  /** Start a job and clear the previous result. */
  startJob: (job: ImageJob) => void;
  setJobProgress: (progress: PlaygroundImageProgress) => void;
  /** Store the result of the running job, with the job's device and input. A result for any other job is ignored. */
  finishJob: (result: ImageOutcome) => void;
}

/** The model the selection points at, when it is in the catalog. */
function selectedModelOf(
  state: Pick<PlaygroundState, "models" | "selectedModelId">,
): ImageModel | null {
  return state.models?.find((m) => m.id === state.selectedModelId) ?? null;
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  models: null,
  selectedModelId: null,
  devices: null,
  form: DEFAULT_IMAGE_FORM,
  inputImage: null,
  strength: DEFAULT_STRENGTH,
  downloads: {},
  upscaleModels: null,
  upscaleModelId: null,
  upscaleInput: null,
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

  setInputImage: (input) => set({ inputImage: input }),

  setInputSourceSize: (size) =>
    set((state) => {
      if (!state.inputImage) return {};
      const selected = selectedModelOf(state);
      const native = selected && isImageToImageModel(selected) ? selected.defaults : null;
      return {
        inputImage: { ...state.inputImage, sourceSize: size },
        form: native ? formWithInputSize(state.form, size, native) : state.form,
      };
    }),

  setStrength: (strength) => set({ strength: clampStrength(strength) }),

  selectEditModel: (model) =>
    set((state) => ({
      selectedModelId: model.id,
      form: formWithInputSize(
        applyModelDefaults(state.form, model.defaults),
        state.inputImage?.sourceSize ?? null,
        model.defaults,
      ),
    })),

  setUpscaleModels: (models) =>
    set((state) => {
      if (state.upscaleModelId && models.some((m) => m.id === state.upscaleModelId)) {
        return { upscaleModels: models };
      }
      return { upscaleModels: models, upscaleModelId: defaultUpscaleModel(models)?.id ?? null };
    }),

  replaceUpscaleModelsAfterDelete: (models, deletedModelId) =>
    set((state) => ({
      upscaleModels: models,
      upscaleModelId: state.upscaleModelId === deletedModelId ? null : state.upscaleModelId,
    })),

  selectUpscaleModel: (modelId) => set({ upscaleModelId: modelId }),

  setUpscaleInput: (input) => set({ upscaleInput: input }),

  setUpscaleInputSize: (size) =>
    set((state) =>
      state.upscaleInput ? { upscaleInput: { ...state.upscaleInput, sourceSize: size } } : {},
    ),

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
      return {
        job: null,
        result: { ...result, kind: job.kind, device: job.device, inputPath: job.inputPath },
      };
    }),
}));
