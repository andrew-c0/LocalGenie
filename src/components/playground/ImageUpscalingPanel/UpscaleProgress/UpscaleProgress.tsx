import { Button } from "@fluentui/react-components";
import type { ImageJob } from "../../../../types";
import { formatElapsed, jobProgressPercent } from "../../../../utils/playground";
import { upscalePhaseLabel } from "../../../../utils/upscale";
import { UPSCALE_PROGRESS_TITLE } from "../../../../utils/upscaleText";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";
import "./UpscaleProgress.css";

const CLOCK_TICK_MS = 1000;

interface UpscaleProgressProps {
  job: ImageJob;
  onCancel: () => void;
}

/** The running upscale in the stage: its stage name, one bar (indeterminate until the runtime counts parts), the elapsed time and Cancel. */
export function UpscaleProgress({ job, onCancel }: UpscaleProgressProps) {
  const now = useNow(CLOCK_TICK_MS);

  return (
    <Flex
      as="section"
      direction="column"
      gap="m"
      align="center"
      justify="center"
      aria-label={UPSCALE_PROGRESS_TITLE}
    >
      <div className="upscale-progress__content">
        <Flex direction="column" gap="s">
          <Body>{upscalePhaseLabel(job)}</Body>
          <ProgressBar value={jobProgressPercent(job)} />
          <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
        </Flex>
      </div>
      <Button appearance="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </Flex>
  );
}
