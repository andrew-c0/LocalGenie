import { Button } from "@fluentui/react-components";
import {
  PauseRegular,
  PlayRegular,
  SkipBack10Regular,
  SkipForward10Regular,
} from "@fluentui/react-icons";
import { BACK_LABEL, FORWARD_LABEL, PAUSE_LABEL, PLAY_LABEL } from "../../../utils/audioText";
import { formatClock, SKIP_SECONDS } from "../../../utils/audioWaveform";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import "./PlayerControls.css";

interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  /** Moves the playhead by this many seconds, from the current time. */
  onSkip: (seconds: number) => void;
}

/** The player's row: back 10 s, the large Play or Pause and forward 10 s centred under the waveform, the time at the right edge. */
export function PlayerControls({
  playing,
  currentTime,
  duration,
  onToggle,
  onSkip,
}: PlayerControlsProps) {
  return (
    <div className="player-controls">
      <Flex gap="s" align="center" className="player-controls__buttons">
        <Button
          appearance="secondary"
          shape="circular"
          icon={<SkipBack10Regular />}
          aria-label={BACK_LABEL}
          title={BACK_LABEL}
          onClick={() => onSkip(-SKIP_SECONDS)}
        />
        <Button
          appearance="primary"
          shape="circular"
          size="large"
          icon={playing ? <PauseRegular /> : <PlayRegular />}
          aria-label={playing ? PAUSE_LABEL : PLAY_LABEL}
          title={playing ? PAUSE_LABEL : PLAY_LABEL}
          onClick={onToggle}
        />
        <Button
          appearance="secondary"
          shape="circular"
          icon={<SkipForward10Regular />}
          aria-label={FORWARD_LABEL}
          title={FORWARD_LABEL}
          onClick={() => onSkip(SKIP_SECONDS)}
        />
      </Flex>
      <div className="player-controls__time">
        <Meta>
          {formatClock(currentTime)} / {formatClock(duration)}
        </Meta>
      </div>
    </div>
  );
}
