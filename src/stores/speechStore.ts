import { create } from "zustand";
import type {
  PlaygroundSpeechProgress,
  SpeechAudioInput,
  SpeechForm,
  SpeechJob,
  SpeechKind,
  SpeechModel,
  SpeechResult,
} from "../types";
import {
  clearDeletedSelection,
  DEFAULT_SPEECH_FORM,
  keepSpeechSelection,
  type SpeechSelection,
} from "../utils/speech";

/**
 * Speech state, kept across page visits: the catalog, each tab's selected model, the speech to text
 * input, the text to speech form, the running job and the last result of each kind. Downloads stay in
 * the Playground store, since their events carry only a model id. The event listeners and the service
 * calls live outside the store (`PlaygroundRuntime` and the panel hooks).
 */
interface SpeechState {
  /** Both kinds of speech model. Null until the catalog has been read. Each tab shows its own kind. */
  models: SpeechModel[] | null;
  selectedModelIds: SpeechSelection;
  /** The recording or file the speech to text tab transcribes. */
  audio: SpeechAudioInput | null;
  form: SpeechForm;
  job: SpeechJob | null;
  /** The last job of each kind that ended, kept until the next job of that kind starts. */
  results: Record<SpeechKind, SpeechResult | null>;

  /** Replace the catalog. Each selection stays when its model is still listed, else a default is chosen. */
  setModels: (models: SpeechModel[]) => void;
  /** Replace the catalog after a delete. The deleted model is not selected again, and no default is chosen. */
  replaceModelsAfterDelete: (models: SpeechModel[], deletedModelId: string) => void;
  /** Select a model for the tab of its kind. */
  selectModel: (model: SpeechModel) => void;
  setAudio: (audio: SpeechAudioInput | null) => void;
  setForm: (patch: Partial<SpeechForm>) => void;

  /** Start a job and clear the previous result of its kind. */
  startJob: (job: SpeechJob) => void;
  setJobProgress: (progress: PlaygroundSpeechProgress) => void;
  /** Store the result of the running job. A result for any other job is ignored. */
  finishJob: (result: SpeechResult) => void;
}

export const useSpeechStore = create<SpeechState>((set) => ({
  models: null,
  selectedModelIds: { stt: null, tts: null },
  audio: null,
  form: DEFAULT_SPEECH_FORM,
  job: null,
  results: { stt: null, tts: null },

  setModels: (models) =>
    set((state) => ({
      models,
      selectedModelIds: keepSpeechSelection(state.selectedModelIds, models),
    })),

  replaceModelsAfterDelete: (models, deletedModelId) =>
    set((state) => ({
      models,
      selectedModelIds: clearDeletedSelection(state.selectedModelIds, deletedModelId),
    })),

  selectModel: (model) =>
    set((state) => ({
      selectedModelIds: { ...state.selectedModelIds, [model.kind]: model.id },
    })),

  setAudio: (audio) => set({ audio }),

  setForm: (patch) => set((state) => ({ form: { ...state.form, ...patch } })),

  startJob: (job) =>
    set((state) => ({
      job,
      results: { ...state.results, [job.kind]: null },
    })),

  setJobProgress: (progress) =>
    set((state) => {
      const job = state.job;
      if (!job || job.jobId !== progress.jobId) return {};
      return { job: { ...job, phase: progress.phase } };
    }),

  finishJob: (result) =>
    set((state) => {
      const job = state.job;
      if (!job || job.jobId !== result.jobId) return {};
      return { job: null, results: { ...state.results, [result.kind]: result } };
    }),
}));
