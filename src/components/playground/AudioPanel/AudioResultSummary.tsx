import { FolderRegular, TimerRegular } from "@fluentui/react-icons";
import type { SpeechResult } from "../../../types";
import { AUDIO_SAVED_PATH_LABEL, AUDIO_TIME_INFO_LABEL } from "../../../utils/audioText";
import { formatDuration } from "../../../utils/format";
import { speechTimingLabel } from "../../../utils/speech";
import { Flex } from "../../ui/Flex/Flex";
import { InfoTooltip } from "../../ui/InfoTooltip/InfoTooltip";
import { Meta } from "../../ui/Typography/Typography";

interface AudioResultSummaryProps {
  /** The finished job shown in the stage. */
  result: SpeechResult;
  /** The file the job saved, or null. */
  savedPath: string | null;
}

/**
 * What a finished job says about itself, on the controls row: how long it took (a timer icon, the full timing in its
 * tooltip) and where it was saved (a folder icon, the path in its tooltip). Like the image result bar.
 */
export function AudioResultSummary({ result, savedPath }: AudioResultSummaryProps) {
  const timing = speechTimingLabel(result.elapsedSeconds, result.audioSeconds);
  const elapsed = result.elapsedSeconds;
  if (timing === null && savedPath === null) return null;

  return (
    <Flex gap="s" align="center" wrap>
      {timing !== null && elapsed !== null && (
        <Flex gap="xs" align="center">
          <InfoTooltip
            label={AUDIO_TIME_INFO_LABEL}
            help={timing}
            icon={<TimerRegular aria-hidden />}
          />
          <Meta>{formatDuration(elapsed * 1000)}</Meta>
        </Flex>
      )}
      {savedPath !== null && (
        <InfoTooltip
          label={AUDIO_SAVED_PATH_LABEL}
          help={savedPath}
          icon={<FolderRegular aria-hidden />}
        />
      )}
    </Flex>
  );
}
