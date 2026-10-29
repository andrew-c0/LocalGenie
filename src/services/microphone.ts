import { concatSamples } from "../utils/wav";

/** Samples per callback of the capture node. Small enough that stopping drops little audio. */
const CAPTURE_BUFFER_SIZE = 4096;

/** Mono samples from -1 to 1, with the rate the audio device captured them at. */
export interface RecordedAudio {
  samples: Float32Array;
  sampleRate: number;
}

/** A recording in progress. `stop` ends it, releases the microphone and returns what was captured. */
export interface MicrophoneCapture {
  stop: () => RecordedAudio;
}

/**
 * Start recording from the default microphone as mono samples. Rejects when the user denies access
 * or no microphone is available; the caller turns the error into a message.
 */
export async function startMicrophoneCapture(): Promise<MicrophoneCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  // The processor is the way to read raw samples without an extra worklet file. It is deprecated in
  // the spec but supported by the webview.
  const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    // Copy the samples: the browser reuses the input buffer after this callback returns.
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(context.destination);

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      const sampleRate = context.sampleRate;
      void context.close();
      return { samples: concatSamples(chunks), sampleRate };
    },
  };
}
