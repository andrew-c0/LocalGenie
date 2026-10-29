import { Button, Spinner } from "@fluentui/react-components";
import { readAudio, revealAudio } from "../../../../services/playground";
import type { SpeechResult } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { speechTimingLabel } from "../../../../utils/speech";
import { speechCancelledText } from "../../../../utils/speechText";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { useSavedDataUrl } from "../../useSavedDataUrl";
import "./SpeechOutput.css";

interface SpeechOutputProps {
  result: SpeechResult;
}

/** The last speech synthesis: a player for the saved file, its folder, and how long it took. */
export function SpeechOutput({ result }: SpeechOutputProps) {
  const path = result.status === "ok" ? result.outputPath : null;
  const audio = useSavedDataUrl(path, readAudio, "Could not open the audio.");

  if (result.status === "error") {
    return (
      <SurfaceCard title="Speech">
        <ErrorBanner message={result.error ?? "The speech could not be generated."} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title="Speech">
        <Body>{speechCancelledText("tts")}</Body>
      </SurfaceCard>
    );
  }

  const reveal = () => {
    if (!path) return;
    revealAudio(path).catch((err: unknown) => {
      toast.error("Could not open the folder", errorMessage(err));
    });
  };
  const timing = speechTimingLabel(result.elapsedSeconds, result.audioSeconds);

  return (
    <SurfaceCard
      title="Speech"
      action={
        path ? (
          <Button appearance="secondary" onClick={reveal}>
            Show in folder
          </Button>
        ) : undefined
      }
    >
      <Flex direction="column" gap="s">
        {!path && <ErrorBanner message="The speech was not saved." />}
        {audio.error && <ErrorBanner message={audio.error} />}
        {path && !audio.error && !audio.dataUrl && <Spinner label="Opening the audio…" />}
        {audio.dataUrl && (
          // The speech is generated, not captioned, so there is no caption track to offer.
          // biome-ignore lint/a11y/useMediaCaption: synthesized speech has no caption track
          <audio className="speech-output__player" controls src={audio.dataUrl} />
        )}
        {timing && <Meta>{timing}</Meta>}
        {path && <Meta className="speech-output__path">Saved to {path}</Meta>}
      </Flex>
    </SurfaceCard>
  );
}
