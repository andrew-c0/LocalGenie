import { Button } from "@fluentui/react-components";
import type { SpeechJob } from "../../../types";
import { formatElapsed } from "../../../utils/playground";
import { speechJobTitle, speechPhaseLabel } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { Body, Meta } from "../../ui/Typography/Typography";
import { useNow } from "../useNow";
import "./SpeechJobProgress.css";

const CLOCK_TICK_MS = 1000;

interface SpeechJobProgressProps {
  job: SpeechJob;
  onCancel: () => void;
}

/**
 * The running speech job in the Audio stage: its stage, a bar that moves with the work (speech has no step count, so
 * the bar is indeterminate), the elapsed time and Cancel. It has no card of its own; the stage holds it.
 */
export function SpeechJobProgress({ job, onCancel }: SpeechJobProgressProps) {
  const now = useNow(CLOCK_TICK_MS);

  return (
    <Flex
      as="section"
      direction="column"
      gap="m"
      align="center"
      justify="center"
      aria-label={speechJobTitle(job.kind)}
    >
      <div className="speech-job-progress__content">
        <Flex direction="column" gap="m">
          <Body>{speechPhaseLabel(job.kind, job.phase)}</Body>
          <ProgressBar value={null} />
          <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
        </Flex>
      </div>
      <Button appearance="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </Flex>
  );
}
