import { useEffect, useRef, useState } from "react";
import { type MicrophoneCapture, startMicrophoneCapture } from "../../../../services/microphone";
import { storeAudio } from "../../../../services/playground";
import { useSpeechStore } from "../../../../stores/speechStore";
import { errorMessage } from "../../../../utils/errorMessage";
import { recordingName, STT_SAMPLE_RATE } from "../../../../utils/speech";
import { EMPTY_RECORDING_MESSAGE, microphoneErrorMessage } from "../../../../utils/speechText";
import { encodeResampledWav } from "../../../../utils/wav";

export interface MicrophoneRecording {
  /** When the recording started, or null when none runs. */
  startedAt: number | null;
  /** The recording is being encoded and saved. */
  isSaving: boolean;
  error: string | null;
  startRecording: () => void;
  /** Stop, and save the recording as the speech input. */
  stopRecording: () => void;
}

/**
 * Records from the microphone and saves the recording as a 16 kHz WAV, which becomes the speech input.
 * Leaving the tab stops a recording still running, so the microphone is released.
 */
export function useMicrophoneRecording(): MicrophoneRecording {
  const setAudio = useSpeechStore((s) => s.setAudio);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, []);

  const startRecording = () => {
    if (captureRef.current) return;
    setError(null);
    startMicrophoneCapture()
      .then((capture) => {
        captureRef.current = capture;
        setStartedAt(Date.now());
      })
      .catch((err: unknown) => setError(microphoneErrorMessage(err)));
  };

  const stopRecording = () => {
    const capture = captureRef.current;
    if (!capture || startedAt === null) return;
    captureRef.current = null;
    const seconds = (Date.now() - startedAt) / 1000;
    setStartedAt(null);

    const recorded = capture.stop();
    if (recorded.samples.length === 0) {
      setError(EMPTY_RECORDING_MESSAGE);
      return;
    }
    const wav = encodeResampledWav(recorded.samples, recorded.sampleRate, STT_SAMPLE_RATE);

    setIsSaving(true);
    storeAudio(Array.from(wav), "wav")
      .then((audioPath) => setAudio({ audioPath, audioName: recordingName(seconds) }))
      .catch((err: unknown) => setError(errorMessage(err, "Could not save the recording.")))
      .finally(() => setIsSaving(false));
  };

  return { startedAt, isSaving, error, startRecording, stopRecording };
}
