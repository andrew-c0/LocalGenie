import { Button, Spinner } from "@fluentui/react-components";
import type { OcrJob } from "../../../../types";
import { OCR_PROGRESS_TITLE } from "../../../../utils/ocrText";
import { formatElapsed } from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";

const CLOCK_TICK_MS = 1000;

interface OcrProgressProps {
  job: OcrJob;
  onCancel: () => void;
}

/** The running OCR job: a centred spinner (the server reports no progress) with the elapsed time under it, and Cancel. */
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
      <Flex direction="column" gap="s" align="center" justify="center" grow>
        <Spinner size="large" aria-label={OCR_PROGRESS_TITLE} />
        <Meta>Elapsed {formatElapsed(now - job.startedAt)}</Meta>
      </Flex>
    </SurfaceCard>
  );
}
