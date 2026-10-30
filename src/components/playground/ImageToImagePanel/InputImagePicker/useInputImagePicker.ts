import { useState } from "react";
import { pickAttachment } from "../../../../services/attachments";
import type { InputImage } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { inputFileName, isSupportedInputPath } from "../../../../utils/imageToImage";
import { UNSUPPORTED_INPUT_MESSAGE } from "../../../../utils/imageToImageText";

export interface InputImagePickerState {
  /** Open the file dialog. A PNG or JPG becomes the input picture; another file is refused. */
  chooseFile: () => void;
  error: string | null;
}

/** Picks the input picture, handed to `setInputImage`, with the app's image file dialog, offering PNG and JPG only. */
export function useInputImagePicker(
  setInputImage: (input: InputImage) => void,
): InputImagePickerState {
  const [error, setError] = useState<string | null>(null);

  const chooseFile = () => {
    setError(null);
    pickAttachment("image", ["png", "jpg", "jpeg"])
      .then((path) => {
        if (!path) return;
        if (!isSupportedInputPath(path)) {
          setError(UNSUPPORTED_INPUT_MESSAGE);
          return;
        }
        setInputImage({ path, name: inputFileName(path), sourceSize: null });
      })
      .catch((err: unknown) => setError(errorMessage(err, "Could not open the file dialog.")));
  };

  return { chooseFile, error };
}
