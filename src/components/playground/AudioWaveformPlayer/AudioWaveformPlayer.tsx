import { Spinner } from "@fluentui/react-components";
import { readAudio } from "../../../services/playground";
import {
  DRAWING_WAVEFORM_LABEL,
  OPENING_AUDIO_FAILED_MESSAGE,
  OPENING_AUDIO_LABEL,
  WAVEFORM_FAILED_MESSAGE,
} from "../../../utils/audioText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { useSavedDataUrl } from "../useSavedDataUrl";
import { useWaveformSamples } from "./useWaveformSamples";
import { WaveformPlayer } from "./WaveformPlayer";
import "./AudioWaveformPlayer.css";

interface AudioWaveformPlayerProps {
  /** The clip to play: a saved file, or an input clip. */
  path: string;
  /** A small caption above the player, e.g. "Input: take 2.wav". */
  label?: string;
  /** Reads the clip as a data URL. Saved outputs use `readAudio`; an input clip uses `readInputAudio`. */
  read?: (path: string) => Promise<string>;
}

/**
 * A clip with a waveform and playback. It is read into the webview first. While it loads, a spinner shows. When the
 * clip cannot be decoded, the webview's own player is shown instead, so the file stays playable.
 */
export function AudioWaveformPlayer({ path, label, read = readAudio }: AudioWaveformPlayerProps) {
  const saved = useSavedDataUrl(path, read, OPENING_AUDIO_FAILED_MESSAGE);
  return (
    <Flex direction="column" gap="xs">
      {label && <Meta>{label}</Meta>}
      <SavedClip dataUrl={saved.dataUrl} error={saved.error} />
    </Flex>
  );
}

interface SavedClipProps {
  dataUrl: string | null;
  error: string | null;
}

function SavedClip({ dataUrl, error }: SavedClipProps) {
  if (error) return <ErrorBanner message={error} />;
  if (!dataUrl) return <Spinner label={OPENING_AUDIO_LABEL} />;
  // A new clip remounts the player, so the playing state and the playhead start again from the beginning.
  return <DecodedClip key={dataUrl} dataUrl={dataUrl} />;
}

function DecodedClip({ dataUrl }: { dataUrl: string }) {
  const waveform = useWaveformSamples(dataUrl);
  if (waveform.error) {
    return (
      <Flex direction="column" gap="s">
        <div title={waveform.error}>
          <ErrorBanner message={WAVEFORM_FAILED_MESSAGE} />
        </div>
        {/* biome-ignore lint/a11y/useMediaCaption: a recording or generated speech has no caption track */}
        <audio className="audio-waveform-player__fallback" controls src={dataUrl} />
      </Flex>
    );
  }
  if (!waveform.decoded) return <Spinner label={DRAWING_WAVEFORM_LABEL} />;
  return <WaveformPlayer dataUrl={dataUrl} decoded={waveform.decoded} />;
}
