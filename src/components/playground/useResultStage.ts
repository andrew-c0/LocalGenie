import { useState } from "react";
import { readImage, readInputImage } from "../../services/playground";
import type { ImageResult, InputImage } from "../../types";
import { resultForInput } from "../../utils/resultStage";
import { useSavedDataUrl } from "./useSavedDataUrl";

interface LoadedPicture {
  dataUrl: string | null;
  error: string | null;
}

export interface ResultStageState {
  /** The last result, only when it was made from the picture on the form. Null for any other picture. */
  result: ImageResult | null;
  /** The result's picture is saved and can be shown. */
  pictureShown: boolean;
  output: LoadedPicture;
  /** The input picture as a data URL, loaded only while a saved result is shown for it. */
  inputDataUrl: string | null;
  comparing: boolean;
  /** Compare needs both pictures, so it stays off until both have loaded. */
  compareReady: boolean;
  toggleCompare: () => void;
}

/**
 * The stage state of an image tab: which result belongs to the picture on the form, the saved pictures, and Compare.
 * Compare is remembered per job, so a new job starts with it off.
 */
export function useResultStage(
  input: InputImage | null,
  lastResult: ImageResult | null,
): ResultStageState {
  const [compareJobId, setCompareJobId] = useState<string | null>(null);

  const result = resultForInput(lastResult, input);
  const savedPath = result?.status === "done" ? result.path : null;
  const pictureShown = savedPath !== null;

  const output = useSavedDataUrl(savedPath, readImage, "Could not open the image.");
  const inputPicture = useSavedDataUrl(
    pictureShown && input ? input.path : null,
    readInputImage,
    "Could not open the input image.",
  );

  const comparing = result !== null && compareJobId === result.jobId;
  const compareReady = output.dataUrl !== null && inputPicture.dataUrl !== null;

  const toggleCompare = () => {
    if (result) setCompareJobId(comparing ? null : result.jobId);
  };

  return {
    result,
    pictureShown,
    output,
    inputDataUrl: inputPicture.dataUrl,
    comparing,
    compareReady,
    toggleCompare,
  };
}
