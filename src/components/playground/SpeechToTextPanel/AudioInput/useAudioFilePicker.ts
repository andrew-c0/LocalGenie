import { useState } from "react";
import { pickAttachment } from "../../../../services/attachments";
import { useSpeechStore } from "../../../../stores/speechStore";
import { errorMessage } from "../../../../utils/errorMessage";
import { fileNameOf, isWavPath } from "../../../../utils/speech";
import { NOT_WAV_MESSAGE } from "../../../../utils/speechText";

export interface AudioFilePicker {
  /** Open the file dialog. A WAV file becomes the speech input; another file is refused. */
  chooseFile: () => void;
  error: string | null;
}

/** Picks a WAV file from disk with the app's audio file dialog. */
export function useAudioFilePicker(): AudioFilePicker {
  const setAudio = useSpeechStore((s) => s.setAudio);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = () => {
    setError(null);
    pickAttachment("audio")
      .then((path) => {
        if (!path) return;
        if (!isWavPath(path)) {
          setError(NOT_WAV_MESSAGE);
          return;
        }
        setAudio({ audioPath: path, audioName: fileNameOf(path) });
      })
      .catch((err: unknown) => setError(errorMessage(err, "Could not open the file dialog.")));
  };

  return { chooseFile, error };
}
