import { create } from "zustand";
import type {
  AudioTask,
  EnhanceKind,
  PlaygroundSpeechProgress,
  SpeechAudioInput,
  SpeechForm,
  SpeechJob,
  SpeechKind,
  SpeechModel,
  SpeechResult,
} from "../types";
import { DEFAULT_ENHANCE_KIND } from "../utils/audioEnhance";
import { DEFAULT_AUDIO_TASK } from "../utils/audioTask";
import {
  clearDeletedSelection,
  DEFAULT_SPEECH_FORM,
  keepSpeechSelection,
  NO_SPEECH_SELECTION,
  type SpeechSelection,
} from "../utils/speech";

/** No result for any kind. */
const NO_SPEECH_RESULTS: Record<SpeechKind, SpeechResult | null> = {
  stt: null,
  tts: null,
  denoise: null,
  separate: null,
};

/** No input clip for any task. */
export const NO_AUDIO_INPUTS: Record<AudioTask, SpeechAudioInput | null> = {
  transcribe: null,
  speak: null,
  enhance: null,
};

/**
 * Speech state, kept across page visits: the catalog, the selected model of each kind, one input clip per task, the
 * text to speech form, the Audio tool's task and clean up or split kind, the running job and the last result of each
 * kind. Downloads live in the download store (the drawer). The event listeners and the service calls live outside the
 * store (`PlaygroundRuntime` and the panel hooks).
 */
interface SpeechState {
  /** Every speech model, of all kinds. Null until the catalog has been read. The Audio tool lists the kind of its task. */
  models: SpeechModel[] | null;
  selectedModelIds: SpeechSelection;
  /**
   * The input clip of each task: the file or recording that task reads. The speak entry is the voice-copy clip of a
   * cloning model. Tasks never share an input; only "Use as input" moves a file from one task to another.
   */
  audios: Record<AudioTask, SpeechAudioInput | null>;
  form: SpeechForm;
  /** The Audio tool's task: transcribe, speak or enhance. */
  audioTask: AudioTask;
  /** The kind the enhance task runs: clean up speech or split voice and music. */
  enhanceKind: EnhanceKind;
  /** The running speech job of any task. There is one job slot. */
  job: SpeechJob | null;
  /** The last job of each kind that ended, kept until the next job of that kind starts. */
  results: Record<SpeechKind, SpeechResult | null>;

  /** Replace the catalog. Each selection stays while its model is still installed, else it is cleared. */
  setModels: (models: SpeechModel[]) => void;
  /** Replace the catalog after a delete. The deleted model is not selected again, and no default is chosen. */
  replaceModelsAfterDelete: (models: SpeechModel[], deletedModelId: string) => void;
  /** Select a model for the kind of its own. */
  selectModel: (model: SpeechModel) => void;
  /** Clear the selection of one kind. */
  clearModelSelection: (kind: SpeechKind) => void;
  /** Set the input clip of one task. The other tasks keep theirs. */
  setAudio: (task: AudioTask, audio: SpeechAudioInput | null) => void;
  /** "Use as input": sets the clip of the task given, and switches to that task. No other task's input changes. */
  takeAsInput: (task: AudioTask, audio: SpeechAudioInput) => void;
  setForm: (patch: Partial<SpeechForm>) => void;
  setAudioTask: (task: AudioTask) => void;
  setEnhanceKind: (kind: EnhanceKind) => void;

  /**
   * Clears every result of the Audio tool and every task's input clip, when the user leaves the tool. Preferences (models,
   * form, task, enhance kind) are kept. A running job is not touched: nothing is cleared while one runs.
   */
  resetAudioWork: () => void;

  /** Start a job and clear the previous result of its kind. */
  startJob: (job: SpeechJob) => void;
  setJobProgress: (progress: PlaygroundSpeechProgress) => void;
  /** Store the result of the running job. A result for any other job is ignored. */
  finishJob: (result: SpeechResult) => void;
}

export const useSpeechStore = create<SpeechState>((set) => ({
  models: null,
  selectedModelIds: NO_SPEECH_SELECTION,
  audios: NO_AUDIO_INPUTS,
  form: DEFAULT_SPEECH_FORM,
  audioTask: DEFAULT_AUDIO_TASK,
  enhanceKind: DEFAULT_ENHANCE_KIND,
  job: null,
  results: NO_SPEECH_RESULTS,

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

  clearModelSelection: (kind) =>
    set((state) => ({
      selectedModelIds: { ...state.selectedModelIds, [kind]: null },
    })),

  setAudio: (task, audio) => set((state) => ({ audios: { ...state.audios, [task]: audio } })),

  takeAsInput: (task, audio) =>
    set((state) => ({
      audios: { ...state.audios, [task]: audio },
      audioTask: task,
    })),

  setForm: (patch) => set((state) => ({ form: { ...state.form, ...patch } })),

  setAudioTask: (audioTask) => set({ audioTask }),

  setEnhanceKind: (enhanceKind) => set({ enhanceKind }),

  resetAudioWork: () =>
    set((state) => {
      if (state.job !== null) return {};
      return { results: NO_SPEECH_RESULTS, audios: NO_AUDIO_INPUTS };
    }),

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
