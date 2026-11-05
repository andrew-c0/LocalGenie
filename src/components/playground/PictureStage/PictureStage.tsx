import type { ReactNode } from "react";
import type { ImageSize, InputImage } from "../../../types";
import type { ResultCopy } from "../../../utils/playgroundText";
import { Meta, Secondary } from "../../ui/Typography/Typography";
import { InputImagePreview } from "../ImageToImagePanel/InputImagePicker/InputImagePreview/InputImagePreview";
import { ResultPictureView } from "../ResultPictureView/ResultPictureView";
import type { ResultStageState } from "../useResultStage";
import "./PictureStage.css";

interface PictureStageProps {
  /** The input picture. Null tabs with no input picture, such as text to image, leave it out. */
  input: InputImage | null;
  /** A job runs for this tab. The input is hidden while it does. */
  jobRunning: boolean;
  /** What the running job shows, e.g. its progress. Null when no job runs. */
  progress: ReactNode;
  emptyMessage: string;
  copy: ResultCopy;
  stage: ResultStageState;
  /** Reports the input picture's size. Left out by a tab with no input picture. */
  onSourceSize?: (size: ImageSize) => void;
}

/**
 * The large picture area at the top of an image tab. It shows one of: the empty prompt (no picture yet), the input
 * picture with its name, the running job, or the result. The input stays mounted when hidden, so its size is reported.
 */
export function PictureStage({
  input,
  jobRunning,
  progress,
  emptyMessage,
  copy,
  stage,
  onSourceSize,
}: PictureStageProps) {
  const hidePreview = jobRunning || stage.pictureShown;
  const showEmpty = input === null && !jobRunning && stage.result === null;

  return (
    <div className="picture-stage">
      {showEmpty && (
        <div className="picture-stage__empty">
          <Secondary>{emptyMessage}</Secondary>
        </div>
      )}
      {input && onSourceSize && (
        <InputImagePreview
          input={input}
          onSourceSize={onSourceSize}
          hidden={hidePreview}
          size="large"
        />
      )}
      {input && !hidePreview && <Meta className="picture-stage__name">{input.name}</Meta>}
      {progress}
      {!jobRunning && stage.result && (
        <ResultPictureView
          key={stage.result.jobId}
          result={stage.result}
          output={stage.output}
          inputDataUrl={stage.inputDataUrl}
          comparing={stage.comparing}
          copy={copy}
        />
      )}
    </div>
  );
}
