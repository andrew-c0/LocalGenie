import { Button } from "@fluentui/react-components";
import type { ImageJob } from "../../../../types";
import {
  formatElapsed,
  generationEtaLabel,
  jobProgressPercent,
} from "../../../../utils/playground";
import { CPU_TIME_NOTE } from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";
import { GenerationPhaseList } from "./GenerationPhaseList/GenerationPhaseList";

const CLOCK_TICK_MS = 1000;

interface GenerationProgressProps {
  job: ImageJob;
  onCancel: () => void;
}

/** The running generation as one block: the stages, a single bar, the elapsed time and the step speed. */
export default function GenerationProgress({ job, onCancel }: GenerationProgressProps) {
  const now = useNow(CLOCK_TICK_MS);
  const eta = generationEtaLabel(job);

  return (
    <SurfaceCard
      title="Generating"
      action={
        <Button appearance="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <Flex direction="column" gap="m">
        <GenerationPhaseList progress={job} />
        <ProgressBar value={jobProgressPercent(job)} />
        <Flex justify="between" gap="m" wrap>
          <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
          {eta && <Meta>{eta}</Meta>}
        </Flex>
        <Meta>{CPU_TIME_NOTE}</Meta>
      </Flex>
    </SurfaceCard>
  );
}
