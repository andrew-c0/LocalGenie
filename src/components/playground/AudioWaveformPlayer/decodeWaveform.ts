import { mixChannels } from "../../../utils/audioWaveform";

/** A clip decoded for drawing: its samples mixed to one channel, and its length in seconds. */
export interface DecodedWaveform {
  samples: Float32Array;
  duration: number;
}

/** The bytes of a base64 data URL. Throws when the text is not a data URL. */
function bytesOfDataUrl(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The audio is not a data URL.");
  const binary = atob(dataUrl.slice(comma + 1));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

/**
 * Decodes a clip's data URL with the webview's audio decoder. The context is made for this one decode and closed after
 * it. Rejects when the webview cannot decode the file.
 */
export async function decodeWaveform(dataUrl: string): Promise<DecodedWaveform> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytesOfDataUrl(dataUrl));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
      buffer.getChannelData(index),
    );
    return { samples: mixChannels(channels), duration: buffer.duration };
  } finally {
    context.close().catch(() => undefined);
  }
}
