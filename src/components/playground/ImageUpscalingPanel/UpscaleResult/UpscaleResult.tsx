import { useState } from "react";
import type { ImageResult, ImageSize } from "../../../../types";
import {
  UPSCALE_CANCELLED_MESSAGE,
  UPSCALE_FAILED_MESSAGE,
  UPSCALE_NOT_SAVED_MESSAGE,
} from "../../../../utils/upscaleText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Body } from "../../../ui/Typography/Typography";
import { ImageCompare } from "../ImageCompare/ImageCompare";
import { revealUpscaled } from "../revealUpscaled";
import "./UpscaleResult.css";
import { UpscaledPicture } from "./UpscaledPicture";

interface UpscaleResultProps {
  result: ImageResult;
  output: { dataUrl: string | null; error: string | null };
  /** The input picture, the left side of the comparison. */
  inputDataUrl: string | null;
  comparing: boolean;
}

/**
 * The stage content for the last result of the picture on the form: the upscaled picture or the comparison. The time,
 * the path and Show in folder are in the controls row. Error, cancelled and not-saved jobs show their reason instead.
 */
export function UpscaleResult({ result, output, inputDataUrl, comparing }: UpscaleResultProps) {
  // The picture's size is kept here, so the comparison opens at the shape the single picture had.
  const [size, setSize] = useState<ImageSize | null>(null);

  if (result.status === "error") {
    return <ErrorBanner message={result.error ?? UPSCALE_FAILED_MESSAGE} />;
  }
  if (result.status === "cancelled") {
    return <Body>{UPSCALE_CANCELLED_MESSAGE}</Body>;
  }

  const path = result.path;
  if (path === null) return <ErrorBanner message={UPSCALE_NOT_SAVED_MESSAGE} />;

  const fileName = path.split(/[\\/]/).pop() ?? path;

  return comparing && inputDataUrl && output.dataUrl ? (
    <ImageCompare before={inputDataUrl} after={output.dataUrl} size={size} onSize={setSize} />
  ) : (
    <UpscaledPicture
      title={fileName}
      dataUrl={output.dataUrl}
      error={output.error}
      onOpenLocation={() => revealUpscaled(path)}
      onSize={setSize}
    />
  );
}
