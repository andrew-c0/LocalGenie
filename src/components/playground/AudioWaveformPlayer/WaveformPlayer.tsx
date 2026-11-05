import { seekBy } from "../../../utils/audioWaveform";
import { Flex } from "../../ui/Flex/Flex";
import type { DecodedWaveform } from "./decodeWaveform";
import { PlayerControls } from "./PlayerControls";
import { usePlayback } from "./usePlayback";
import { WaveformArea } from "./WaveformArea";

interface WaveformPlayerProps {
  dataUrl: string;
  decoded: DecodedWaveform;
}

/**
 * A clip that has been decoded: the waveform with its playhead, the controls under it, and the hidden audio element
 * that plays the clip. Its length is the element's once loaded, the decoded one until then.
 */
export function WaveformPlayer({ dataUrl, decoded }: WaveformPlayerProps) {
  const playback = usePlayback();
  const duration = playback.duration > 0 ? playback.duration : decoded.duration;

  return (
    <Flex direction="column" gap="xs">
      <WaveformArea
        samples={decoded.samples}
        duration={duration}
        currentTime={playback.currentTime}
        onSeek={playback.seekTo}
      />
      <PlayerControls
        playing={playback.playing}
        currentTime={playback.currentTime}
        duration={duration}
        onToggle={playback.togglePlayback}
        onSkip={(seconds) => playback.seekTo(seekBy(playback.currentTime, seconds, duration))}
      />
      <audio
        ref={playback.audioRef}
        src={dataUrl}
        preload="metadata"
        hidden
        {...playback.audioEvents}
      />
    </Flex>
  );
}
