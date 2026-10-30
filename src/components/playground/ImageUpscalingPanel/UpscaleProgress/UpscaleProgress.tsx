import { Button } from "@fluentui/react-components";
import type { ImageJob } from "../../../../types";
import { formatElapsed, jobProgressPercent } from "../../../../utils/playground";
import { upscalePhaseLabel } from "../../../../utils/upscale";
import { UPSCALE_CPU_NOTE, UPSCALE_PROGRESS_TITLE } from "../../../../utils/upscaleText";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";

const CLOCK_TICK_MS = 1000;

interface UpscaleProgressProps {
  job: ImageJob;
  onCancel: () => void;
}

/** The running upscale: its stage, one bar (indeterminate until the runtime counts parts), the elapsed time and Cancel. */
export function UpscaleProgress({ job, onCancel }: UpscaleProgressProps) {
  const now = useNow(CLOCK_TICK_MS);

  return (
    <SurfaceCard
      title={UPSCALE_PROGRESS_TITLE}
      action={
        <Button appearance="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <Flex direction="column" gap="m">
        <Body>{upscalePhaseLabel(job)}</Body>
        <ProgressBar value={jobProgressPercent(job)} />
        <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
        <Meta>{UPSCALE_CPU_NOTE}</Meta>
      </Flex>
    </SurfaceCard>
  );
}
