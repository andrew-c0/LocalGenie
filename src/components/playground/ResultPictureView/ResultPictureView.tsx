import { useState } from "react";
import type { ImageResult, ImageSize } from "../../../types";
import type { ResultCopy } from "../../../utils/playgroundText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Body } from "../../ui/Typography/Typography";
import { ImageCompare } from "../ImageCompare/ImageCompare";
import { revealSavedImage } from "../revealSavedImage";
import { ResultPicture } from "./ResultPicture";
import "./ResultPictureView.css";

interface ResultPictureViewProps {
  result: ImageResult;
  output: { dataUrl: string | null; error: string | null };
  /** The input picture, the left side of the comparison. */
  inputDataUrl: string | null;
  comparing: boolean;
  copy: ResultCopy;
}

/**
 * The stage content for a job's result: the result picture, or the comparison with the input. A failed, cancelled or
 * unsaved job shows its reason instead. The time, the path and Show in folder belong to the controls, not here.
 */
export function ResultPictureView({
  result,
  output,
  inputDataUrl,
  comparing,
  copy,
}: ResultPictureViewProps) {
  // The picture's size is kept here, so the comparison opens at the shape the single picture had.
  const [size, setSize] = useState<ImageSize | null>(null);

  if (result.status === "error") {
    return <ErrorBanner message={result.error ?? copy.failedMessage} />;
  }
  if (result.status === "cancelled") {
    return <Body>{copy.cancelledMessage}</Body>;
  }

  const path = result.path;
  if (path === null) return <ErrorBanner message={copy.notSavedMessage} />;

  const fileName = path.split(/[/]/).pop() ?? path;

  return comparing && inputDataUrl && output.dataUrl ? (
    <ImageCompare
      before={inputDataUrl}
      after={output.dataUrl}
      size={size}
      onSize={setSize}
      copy={copy.compare}
    />
  ) : (
    <ResultPicture
      title={fileName}
      dataUrl={output.dataUrl}
      error={output.error}
      alt={copy.outputAlt}
      enlargeLabel={copy.enlargeLabel}
      onOpenLocation={() => revealSavedImage(path)}
      onSize={setSize}
    />
  );
}
