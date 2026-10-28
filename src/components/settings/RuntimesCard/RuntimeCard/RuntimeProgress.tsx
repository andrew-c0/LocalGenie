import { Spinner } from "@fluentui/react-components";
import type { RuntimeInstallProgress } from "../../../../types";
import { runtimeProgressLabel, runtimeProgressPercent } from "../../../../utils/runtimeProgress";
import { Flex } from "../../../ui/Flex/Flex";
import { ProgressBar } from "../../../ui/ProgressBar/ProgressBar";
import { Body, Meta } from "../../../ui/Typography/Typography";

/** Stage label and bar for one install or update. A spinner stands in while the size is unknown. */
export function RuntimeProgress({ progress }: { progress: RuntimeInstallProgress }) {
  const percent = runtimeProgressPercent(progress);
  return (
    <Flex direction="column" gap="xs">
      <Body>{runtimeProgressLabel(progress)}</Body>
      {percent === null ? <Spinner size="tiny" /> : <ProgressBar value={percent} />}
      {progress.message && <Meta>{progress.message}</Meta>}
    </Flex>
  );
}
