import { useSpeechStore } from "../../../stores/speechStore";
import type {
  AudioTask,
  EnhanceKind,
  SpeechAudioInput,
  SpeechForm,
  SpeechJob,
  SpeechModel,
  SpeechResult,
  SpeechVoice,
} from "../../../types";
import { audioTaskBlockedReason, speechKindOfTask } from "../../../utils/audioTask";
import type { RuntimeStatus } from "../../../utils/playground";
import { fileNameOf, resolveVoiceId, SHERPA_RUNTIME_ID } from "../../../utils/speech";
import { useSpeechJobCancel } from "../SpeechJobProgress/useSpeechJobCancel";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { useEnhancement } from "./useEnhancement";
import { useSynthesis } from "./useSynthesis";
import { useTranscription } from "./useTranscription";

/** What the Audio card reads and does. */
export interface AudioPanelState {
  runtime: { status: RuntimeStatus; error: string | null };
  /** Every speech model, or null until the catalog has been read. */
  models: SpeechModel[] | null;
  /** The model of the active task's kind that the tool uses. */
  selected: SpeechModel | null;
  task: AudioTask;
  enhanceKind: EnhanceKind;
  /** The active task's own input clip, or null. */
  audio: SpeechAudioInput | null;
  form: SpeechForm;
  setForm: (patch: Partial<SpeechForm>) => void;
  setAudioTask: (task: AudioTask) => void;
  setEnhanceKind: (kind: EnhanceKind) => void;
  voices: SpeechVoice[];
  voiceId: number | null;
  needsReference: boolean;
  /** The running speech job of any task, or null. */
  job: SpeechJob | null;
  /** The finished job of the task's kind, shown only while no job runs. */
  shownResult: SpeechResult | null;
  blockedReason: string | null;
  cancel: () => void;
  /** Starts the active task's job with the model and input chosen. */
  run: () => void;
  /** Takes a saved file as the input of the task given, and switches to that task. */
  takeAsInput: (path: string, next: AudioTask) => void;
}

/**
 * Everything the Audio card reads and does: the active task, the model it uses, its own input clip and the job. The
 * task's own work (transcribe, synthesize, enhance) starts from `run`, and a finished file can be taken as the input.
 */
export function useAudioPanel(): AudioPanelState {
  const runtime = useRuntimeCheck(SHERPA_RUNTIME_ID);
  const models = useSpeechStore((s) => s.models);
  const task = useSpeechStore((s) => s.audioTask);
  const enhanceKind = useSpeechStore((s) => s.enhanceKind);
  const kind = speechKindOfTask(task, enhanceKind);
  const selectedId = useSpeechStore((s) => s.selectedModelIds[kind]);
  const result = useSpeechStore((s) => s.results[kind]);
  const audio = useSpeechStore((s) => s.audios[task]);
  const job = useSpeechStore((s) => s.job);
  const form = useSpeechStore((s) => s.form);
  const setForm = useSpeechStore((s) => s.setForm);
  const takeAsInputInStore = useSpeechStore((s) => s.takeAsInput);
  const setAudioTask = useSpeechStore((s) => s.setAudioTask);
  const setEnhanceKind = useSpeechStore((s) => s.setEnhanceKind);
  const { transcribe } = useTranscription();
  const { synthesize } = useSynthesis();
  const { enhance } = useEnhancement();
  const cancel = useSpeechJobCancel();

  const selected = models?.find((m) => m.id === selectedId && m.kind === kind) ?? null;
  const voices = selected?.voices ?? [];
  const voiceId = resolveVoiceId(form.voiceId, voices);
  const audioPath = audio?.audioPath ?? null;
  const blockedReason = audioTaskBlockedReason(task, {
    runtime: runtime.status,
    model: selected,
    audioPath,
    text: form.text,
    voiceId,
    jobRunning: job !== null,
  });

  const run = () => {
    if (!selected) return;
    if (task === "speak") {
      if (selected.needsReference) synthesize(selected, form, 0, audioPath);
      else if (voiceId !== null) synthesize(selected, form, voiceId);
      return;
    }
    if (!audio) return;
    if (task === "transcribe") transcribe(selected, audio);
    else enhance(selected, audio);
  };

  /** Takes a saved file as the input of the task given, and switches to that task. Other tasks keep their inputs. */
  const takeAsInput = (path: string, next: AudioTask) => {
    takeAsInputInStore(next, { audioPath: path, audioName: fileNameOf(path) });
  };

  return {
    runtime,
    models,
    selected,
    task,
    enhanceKind,
    audio,
    form,
    setForm,
    setAudioTask,
    setEnhanceKind,
    voices,
    voiceId,
    needsReference: selected?.needsReference ?? false,
    job,
    /** The finished job of the task's kind, shown only while no job runs. */
    shownResult: job === null ? result : null,
    blockedReason,
    cancel,
    run,
    takeAsInput,
  };
}
