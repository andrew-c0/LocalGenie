import type { ImageJob, ImageSize, InputImage } from "../../../../types";
import { UPSCALE_STAGE_EMPTY_MESSAGE } from "../../../../utils/upscaleText";
import { Meta, Secondary } from "../../../ui/Typography/Typography";
import { InputImagePreview } from "../../ImageToImagePanel/InputImagePicker/InputImagePreview/InputImagePreview";
import { UpscaleProgress } from "../UpscaleProgress/UpscaleProgress";
import { UpscaleResult } from "../UpscaleResult/UpscaleResult";
import type { UpscaleStageState } from "../useUpscaleStage";
import "./UpscaleStage.css";

interface UpscaleStageProps {
  input: InputImage | null;
  job: ImageJob | null;
  stage: UpscaleStageState;
  onCancel: () => void;
  onSourceSize: (size: ImageSize) => void;
}

/**
 * The picture area at the top of the card. It shows one of: the empty prompt (no picture yet), the input picture, the
 * running job, or the last result. The input stays mounted even when hidden, so its size is still reported.
 */
export function UpscaleStage({ input, job, stage, onCancel, onSourceSize }: UpscaleStageProps) {
  const hidePreview = job !== null || stage.pictureShown;

  return (
    <div className="upscale-stage">
      {input === null && (
        <div className="upscale-stage__empty">
          <Secondary>{UPSCALE_STAGE_EMPTY_MESSAGE}</Secondary>
        </div>
      )}
      {input && (
        <InputImagePreview
          input={input}
          onSourceSize={onSourceSize}
          hidden={hidePreview}
          size="large"
        />
      )}
      {job && <UpscaleProgress job={job} onCancel={onCancel} />}
      {!job && stage.result && (
        <UpscaleResult
          key={stage.result.jobId}
          result={stage.result}
          output={stage.output}
          inputDataUrl={stage.inputDataUrl}
          comparing={stage.comparing}
        />
      )}
      {input && !hidePreview && <Meta className="upscale-stage__name">{input.name}</Meta>}
    </div>
  );
}
