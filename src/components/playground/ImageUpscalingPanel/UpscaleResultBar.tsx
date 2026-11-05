import { FolderRegular, TimerRegular } from "@fluentui/react-icons";
import type { ImageResult } from "../../../types";
import { formatDuration } from "../../../utils/format";
import {
  UPSCALE_SAVED_PATH_LABEL,
  UPSCALE_TIME_LABEL,
  upscaledInLabel,
} from "../../../utils/upscaleText";
import { Flex } from "../../ui/Flex/Flex";
import { InfoTooltip } from "../../ui/InfoTooltip/InfoTooltip";
import { Meta } from "../../ui/Typography/Typography";

interface UpscaleResultBarProps {
  result: ImageResult;
}

/** What a finished upscale says about itself, in the controls row: the time it took and where it was saved. */
export function UpscaleResultBar({ result }: UpscaleResultBarProps) {
  const duration = result.seconds === null ? null : formatDuration(result.seconds * 1000);

  return (
    <Flex gap="m" align="center" wrap>
      {duration !== null && (
        <Flex gap="xs" align="center">
          <InfoTooltip
            label={UPSCALE_TIME_LABEL}
            help={upscaledInLabel(duration)}
            icon={<TimerRegular aria-hidden />}
          />
          <Meta>{duration}</Meta>
        </Flex>
      )}
      {result.path && (
        <InfoTooltip
          label={UPSCALE_SAVED_PATH_LABEL}
          help={result.path}
          icon={<FolderRegular aria-hidden />}
        />
      )}
    </Flex>
  );
}
