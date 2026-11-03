import { Divider } from "@fluentui/react-components";
import type { SystemUsage as UsageSample } from "../../../services/system";
import { formatGigabytes } from "../../../utils/format";
import { Flex } from "../../ui/Flex/Flex";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { Body, BodyStrong, Meta } from "../../ui/Typography/Typography";
import { ModelMemoryRow } from "./ModelMemoryRow";

interface RamUsageProps {
  sample: UsageSample;
  /** The model row is shown only while a GenieX model is loaded. */
  modelLoaded: boolean;
}

/** System RAM in use, with the model row when a GenieX model is loaded. Renders nothing when the total is unknown. */
export function RamUsage({ sample, modelLoaded }: RamUsageProps) {
  if (sample.memoryTotalBytes <= 0) return null;
  const ramPercent = (sample.memoryUsedBytes / sample.memoryTotalBytes) * 100;

  return (
    <>
      <Divider />
      <Flex direction="column" gap="xs">
        <Flex justify="between" align="center">
          <BodyStrong>RAM</BodyStrong>
          <Body>{Math.round(ramPercent)}%</Body>
        </Flex>
        <ProgressBar value={ramPercent} />
        <Flex direction="column" gap="xs">
          <Flex justify="between" align="center">
            <Meta>System</Meta>
            <Meta>
              {formatGigabytes(sample.memoryUsedBytes)} / {formatGigabytes(sample.memoryTotalBytes)}
            </Meta>
          </Flex>
          {modelLoaded && <ModelMemoryRow modelBytes={sample.modelMemoryBytes} />}
        </Flex>
      </Flex>
    </>
  );
}
