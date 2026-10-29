import { Button, Textarea } from "@fluentui/react-components";
import type { SpeechResult } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { speechTimingLabel } from "../../../../utils/speech";
import {
  NO_SPEECH_MESSAGE,
  speechCancelledText,
  TRANSCRIPT_COPIED_TITLE,
} from "../../../../utils/speechText";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";

interface TranscriptResultProps {
  result: SpeechResult;
}

/** The last transcription: the transcript in a read-only field with Copy, and how long it took. */
export function TranscriptResult({ result }: TranscriptResultProps) {
  if (result.status === "error") {
    return (
      <SurfaceCard title="Transcript">
        <ErrorBanner message={result.error ?? "The audio could not be transcribed."} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title="Transcript">
        <Body>{speechCancelledText("stt")}</Body>
      </SurfaceCard>
    );
  }

  const text = result.text ?? "";
  const timing = speechTimingLabel(result.elapsedSeconds, result.audioSeconds);

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(TRANSCRIPT_COPIED_TITLE))
      .catch((err: unknown) => toast.error("Could not copy the transcript", errorMessage(err)));
  };

  return (
    <SurfaceCard
      title="Transcript"
      action={
        <Button appearance="secondary" onClick={copy} disabled={text === ""}>
          Copy
        </Button>
      }
    >
      <Flex direction="column" gap="s">
        <Textarea aria-label="Transcript" readOnly resize="vertical" rows={6} value={text} />
        {text === "" && <Meta>{NO_SPEECH_MESSAGE}</Meta>}
        {timing && <Meta>{timing}</Meta>}
      </Flex>
    </SurfaceCard>
  );
}
