import { Button } from "@fluentui/react-components";
import { DesktopRegular, FolderRegular, TimerRegular } from "@fluentui/react-icons";
import type { ImageResult, PlaygroundDevice } from "../../../../types";
import { formatDuration } from "../../../../utils/format";
import { deviceSummaryLabel } from "../../../../utils/playground";
import type { ResultBarCopy } from "../../../../utils/playgroundText";
import {
  COMPUTED_ON_LABEL,
  computedOnLabel,
  SAVED_PATH_LABEL,
  seedLabel,
  USE_SEED_LABEL,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { InfoTooltip } from "../../../ui/InfoTooltip/InfoTooltip";
import { Meta } from "../../../ui/Typography/Typography";

interface GenerationResultBarProps {
  result: ImageResult;
  /** Names the device the result ran on. Empty until the devices have been read. */
  devices: PlaygroundDevice[] | null;
  onUseSeed: (seed: number) => void;
  /** The time tooltip's wording, which differs by tab. */
  copy: ResultBarCopy;
}

/**
 * What a finished image says about itself, shared by both image tabs: how long it took, the device it ran on, its seed
 * (shown, with Use seed) and where it was saved. The time, device and path are icons with tooltips.
 */
export function GenerationResultBar({
  result,
  devices,
  onUseSeed,
  copy,
}: GenerationResultBarProps) {
  const duration = result.seconds === null ? null : formatDuration(result.seconds * 1000);
  const seed = result.seed;

  return (
    <Flex gap="s" align="center" wrap>
      {duration !== null && (
        <Flex gap="xs" align="center">
          <InfoTooltip
            label={copy.timeLabel}
            help={copy.timeHelp(duration)}
            icon={<TimerRegular aria-hidden />}
          />
          <Meta>{duration}</Meta>
        </Flex>
      )}
      <InfoTooltip
        label={COMPUTED_ON_LABEL}
        help={computedOnLabel(deviceSummaryLabel(result.device, devices ?? []))}
        icon={<DesktopRegular aria-hidden />}
      />
      {seed !== null && (
        <Flex gap="xs" align="center">
          <Meta>{seedLabel(seed)}</Meta>
          <Button size="small" appearance="secondary" onClick={() => onUseSeed(seed)}>
            {USE_SEED_LABEL}
          </Button>
        </Flex>
      )}
      {result.path && (
        <InfoTooltip
          label={SAVED_PATH_LABEL}
          help={result.path}
          icon={<FolderRegular aria-hidden />}
        />
      )}
    </Flex>
  );
}
