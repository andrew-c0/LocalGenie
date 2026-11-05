import { Button } from "@fluentui/react-components";
import type { ImageJob } from "../../../../types";
import { EDIT_PROGRESS_LABEL } from "../../../../utils/imageToImageText";
import {
  formatElapsed,
  generationEtaLabel,
  jobProgressPercent,
} from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { Meta } from "../../../ui/Typography/Typography";
import { GenerationPhaseList } from "../../ImageGeneration/GenerationProgress/GenerationPhaseList/GenerationPhaseList";
import { useNow } from "../../useNow";
import "./EditProgress.css";

const CLOCK_TICK_MS = 1000;

interface EditProgressProps {
  job: ImageJob;
  onCancel: () => void;
}

/** The running edit in the stage: its stages, one bar, the elapsed time with the estimate, and Cancel. */
export function EditProgress({ job, onCancel }: EditProgressProps) {
  const now = useNow(CLOCK_TICK_MS);
  const eta = generationEtaLabel(job);

  return (
    <Flex
      as="section"
      direction="column"
      gap="m"
      align="center"
      justify="center"
      aria-label={EDIT_PROGRESS_LABEL}
    >
      <div className="edit-progress__content">
        <Flex direction="column" gap="m">
          <GenerationPhaseList progress={job} />
          <ProgressBar value={jobProgressPercent(job)} />
          <Flex justify="between" gap="m" wrap>
            <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
            {eta && <Meta>{eta}</Meta>}
          </Flex>
        </Flex>
      </div>
      <Button appearance="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </Flex>
  );
}
