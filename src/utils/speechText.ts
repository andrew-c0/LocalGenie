import type { SpeechKind, SpeechPhase } from "../types";
import { errorMessage } from "./errorMessage";

/** Copy for the Playground speech tabs, kept in one place so wording changes stay in one file. */

export const SPEECH_CPU_NOTE = "Compute: CPU only for now.";

export const SPEED_HELP =
  "How fast the voice speaks. 1.0x is the model's normal pace; lower is slower, higher is faster.";

export const AUDIO_INPUT_HINT =
  "Choose a .wav file, or record from the microphone. A longer recording takes longer to transcribe.";

export const NOT_WAV_MESSAGE = "Choose a .wav file.";

export const EMPTY_RECORDING_MESSAGE = "Nothing was recorded.";

export const NO_SPEECH_MESSAGE = "No speech was recognised.";

export const TRANSCRIPT_COPIED_TITLE = "Transcript copied";

const SPEECH_PHASE_LABELS: Record<SpeechKind, Record<SpeechPhase, string>> = {
  stt: { loading: "Loading model", running: "Transcribing", saving: "Saving" },
  tts: { loading: "Loading model", running: "Generating speech", saving: "Saving" },
};

/** Label of one stage of a speech job, e.g. "Transcribing". */
export function speechPhaseLabel(kind: SpeechKind, phase: SpeechPhase): string {
  return SPEECH_PHASE_LABELS[kind][phase];
}

const SPEECH_JOB_TITLES: Record<SpeechKind, string> = {
  stt: "Transcribing",
  tts: "Generating speech",
};

/** Title of the card that shows a running speech job. */
export function speechJobTitle(kind: SpeechKind): string {
  return SPEECH_JOB_TITLES[kind];
}

/** Toast title for a speech job that finished. */
export function speechDoneTitle(kind: SpeechKind): string {
  return kind === "stt" ? "Transcript ready" : "Speech ready";
}

/** Toast title for a speech job that failed. */
export function speechFailedTitle(kind: SpeechKind): string {
  return kind === "stt" ? "Transcription failed" : "Speech generation failed";
}

/** Line shown in place of a result when the user stopped the job. */
export function speechCancelledText(kind: SpeechKind): string {
  return kind === "stt" ? "Transcription cancelled." : "Speech generation cancelled.";
}

const MICROPHONE_DENIED =
  "Microphone access was denied. Allow microphone access for LocalGenie in Windows Settings, then try again.";
const MICROPHONE_MISSING = "No microphone was found.";
const MICROPHONE_BUSY = "The microphone is in use by another app.";

/** The error name the browser gives in a thrown value, or an empty string when there is none. */
function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err && typeof err.name === "string") {
    return err.name;
  }
  return "";
}

/** Why the microphone could not start, in words the user can act on. */
export function microphoneErrorMessage(err: unknown): string {
  const name = errorName(err);
  if (name === "NotAllowedError" || name === "SecurityError") return MICROPHONE_DENIED;
  if (name === "NotFoundError" || name === "OverconstrainedError") return MICROPHONE_MISSING;
  if (name === "NotReadableError") return MICROPHONE_BUSY;
  return errorMessage(err, "Could not start recording.");
}
