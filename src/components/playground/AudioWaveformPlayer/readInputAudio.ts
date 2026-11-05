import { readAttachment } from "../../../services/attachments";
import { INPUT_NOT_READ_MESSAGE } from "../../../utils/audioText";

/**
 * A chosen or recorded input clip as a data URL. Unlike `readAudio`, which reads only the app's own output folders,
 * this reads any audio file the user picked, so the input can play where it is.
 */
export async function readInputAudio(path: string): Promise<string> {
  const file = await readAttachment(path);
  if (file.data === null) throw new Error(INPUT_NOT_READ_MESSAGE);
  return `data:${file.mime ?? "audio/wav"};base64,${file.data}`;
}
