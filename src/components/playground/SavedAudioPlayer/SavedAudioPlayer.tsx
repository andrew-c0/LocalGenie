import { Spinner } from "@fluentui/react-components";
import { readAudio } from "../../../services/playground";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { useSavedDataUrl } from "../useSavedDataUrl";
import "./SavedAudioPlayer.css";

interface SavedAudioPlayerProps {
  /** The saved audio file to play. */
  path: string;
}

/** A player for a saved audio file. The file is read into the webview first, so it plays from a data URL. */
export function SavedAudioPlayer({ path }: SavedAudioPlayerProps) {
  const audio = useSavedDataUrl(path, readAudio, "Could not open the audio.");

  if (audio.error) return <ErrorBanner message={audio.error} />;
  if (!audio.dataUrl) return <Spinner label="Opening the audio…" />;

  // The audio is generated or processed, not captioned, so there is no caption track to offer.
  return (
    // biome-ignore lint/a11y/useMediaCaption: generated or processed audio has no caption track
    <audio className="saved-audio-player__player" controls src={audio.dataUrl} />
  );
}
