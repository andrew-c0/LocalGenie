import { Button } from "@fluentui/react-components";
import type { ImageJob } from "../../../../types";
import {
  formatElapsed,
  generationEtaLabel,
  jobProgressPercent,
} from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";
import { GenerationPhaseList } from "../GenerationProgress/GenerationPhaseList/GenerationPhaseList";
import "./ImageJobProgress.css";

const CLOCK_TICK_MS = 1000;

interface ImageJobProgressProps {
  job: ImageJob;
  /** The accessible name of the progress block, e.g. "Generating". */
  label: string;
  onCancel: () => void;
}

/**
 * A running image job in the stage, for both image tabs: its stages, one bar, the elapsed time with the estimate, and
 * Cancel. It has no card of its own; the stage holds it.
 */
export function ImageJobProgress({ job, label, onCancel }: ImageJobProgressProps) {
  const now = useNow(CLOCK_TICK_MS);
  const eta = generationEtaLabel(job);

  return (
    <Flex
      as="section"
      direction="column"
      gap="m"
      align="center"
      justify="center"
      aria-label={label}
    >
      <div className="image-job-progress__content">
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
