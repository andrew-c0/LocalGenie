import { Button } from "@fluentui/react-components";
import type { OcrJob } from "../../../../types";
import { OCR_PROGRESS_TITLE, OCR_TIME_NOTE } from "../../../../utils/ocrText";
import { formatElapsed } from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";

const CLOCK_TICK_MS = 1000;

interface OcrProgressProps {
  job: OcrJob;
  onCancel: () => void;
}

/** The running OCR job: an indeterminate bar (the server reports no progress), the elapsed time and Cancel. */
export function OcrProgress({ job, onCancel }: OcrProgressProps) {
  const now = useNow(CLOCK_TICK_MS);

  return (
    <SurfaceCard
      title={OCR_PROGRESS_TITLE}
      action={
        <Button appearance="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <Flex direction="column" gap="m">
        <ProgressBar value={null} />
        <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
        <Meta>{OCR_TIME_NOTE}</Meta>
      </Flex>
    </SurfaceCard>
  );
}
