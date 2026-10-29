import { Button } from "@fluentui/react-components";
import type { SpeechJob } from "../../../types";
import { formatElapsed } from "../../../utils/playground";
import { speechJobTitle, speechPhaseLabel } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../ui/Typography/Typography";
import { useNow } from "../useNow";

const CLOCK_TICK_MS = 1000;

interface SpeechJobProgressProps {
  job: SpeechJob;
  onCancel: () => void;
}

/** The running speech job: its stage, a bar that moves with the work, the elapsed time and Cancel. Speech has no step count, so the bar is indeterminate. */
export function SpeechJobProgress({ job, onCancel }: SpeechJobProgressProps) {
  const now = useNow(CLOCK_TICK_MS);

  return (
    <SurfaceCard
      title={speechJobTitle(job.kind)}
      action={
        <Button appearance="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <Flex direction="column" gap="m">
        <Body>{speechPhaseLabel(job.kind, job.phase)}</Body>
        <ProgressBar value={null} />
        <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
      </Flex>
    </SurfaceCard>
  );
}
