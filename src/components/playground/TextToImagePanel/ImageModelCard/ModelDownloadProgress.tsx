import { Spinner } from "@fluentui/react-components";
import type { PlaygroundDownloadProgress } from "../../../../types";
import { downloadProgressLabel, overallDownloadPercent } from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { Body } from "../../../ui/Typography/Typography";

/** Label and bar for one model download. `progress` is null until the first event; a spinner stands in while the size is unknown. */
export function ModelDownloadProgress({
  progress,
}: {
  progress: PlaygroundDownloadProgress | null;
}) {
  const percent = progress ? overallDownloadPercent(progress) : 0;
  return (
    <Flex direction="column" gap="xs">
      <Body>{downloadProgressLabel(progress)}</Body>
      {percent === null ? <Spinner size="tiny" /> : <ProgressBar value={percent} />}
    </Flex>
  );
}
