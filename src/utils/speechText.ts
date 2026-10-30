import type { SpeechKind, SpeechPhase } from "../types";
import { errorMessage } from "./errorMessage";

/** Copy for the Playground speech tabs, kept in one place so wording changes stay in one file. */

export const SPEECH_CPU_NOTE = "Compute: CPU only for now.";

export const SPEED_HELP =
  "How fast the voice speaks. 1.0x is the model's normal pace; lower is slower, higher is faster.";

export const AUDIO_INPUT_HINT =
  "Choose a .wav file, or record from the microphone. A longer recording takes longer to transcribe.";

export const REFERENCE_SECTION_TITLE = "Voice to copy";

export const REFERENCE_HINT =
  "Choose a .wav file, or record from the microphone. A clean 5 to 15 second clip of one speaker works best.";

export const REFERENCE_REQUIRED_MESSAGE = "Choose or record a voice to copy first.";

export const NOT_WAV_MESSAGE = "Choose a .wav file.";

export const EMPTY_RECORDING_MESSAGE = "Nothing was recorded.";

export const NO_SPEECH_MESSAGE = "No speech was recognised.";

export const TRANSCRIPT_COPIED_TITLE = "Transcript copied";

const SPEECH_PHASE_LABELS: Record<SpeechKind, Record<SpeechPhase, string>> = {
  stt: { loading: "Loading model", running: "Transcribing", saving: "Saving" },
  tts: { loading: "Loading model", running: "Generating speech", saving: "Saving" },
  denoise: { loading: "Loading model", running: "Cleaning up speech", saving: "Saving" },
  separate: { loading: "Loading model", running: "Splitting voice and music", saving: "Saving" },
};

/** Label of one stage of a speech job, e.g. "Transcribing". */
export function speechPhaseLabel(kind: SpeechKind, phase: SpeechPhase): string {
  return SPEECH_PHASE_LABELS[kind][phase];
}

const SPEECH_JOB_TITLES: Record<SpeechKind, string> = {
  stt: "Transcribing",
  tts: "Generating speech",
  denoise: "Cleaning up speech",
  separate: "Splitting voice and music",
};

/** Title of the card that shows a running speech job. */
export function speechJobTitle(kind: SpeechKind): string {
  return SPEECH_JOB_TITLES[kind];
}

const SPEECH_DONE_TITLES: Record<SpeechKind, string> = {
  stt: "Transcript ready",
  tts: "Speech ready",
  denoise: "Speech cleaned up",
  separate: "Voice and music split",
};

/** Toast title for a speech job that finished. */
export function speechDoneTitle(kind: SpeechKind): string {
  return SPEECH_DONE_TITLES[kind];
}

const SPEECH_FAILED_TITLES: Record<SpeechKind, string> = {
  stt: "Transcription failed",
  tts: "Speech generation failed",
  denoise: "Clean-up failed",
  separate: "Split failed",
};

/** Toast title for a speech job that failed. */
export function speechFailedTitle(kind: SpeechKind): string {
  return SPEECH_FAILED_TITLES[kind];
}

const SPEECH_CANCELLED_TEXTS: Record<SpeechKind, string> = {
  stt: "Transcription cancelled.",
  tts: "Speech generation cancelled.",
  denoise: "Clean-up cancelled.",
  separate: "Split cancelled.",
};

/** Line shown in place of a result when the user stopped the job. */
export function speechCancelledText(kind: SpeechKind): string {
  return SPEECH_CANCELLED_TEXTS[kind];
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
