import { Button, Textarea } from "@fluentui/react-components";
import type { SpeechResult } from "../../../types";
import { TRANSCRIBE_FAILED_MESSAGE, TRANSCRIBE_RESULT_TITLE } from "../../../utils/audioText";
import { errorMessage } from "../../../utils/errorMessage";
import { NO_SPEECH_MESSAGE, TRANSCRIPT_COPIED_TITLE } from "../../../utils/speechText";
import { toast } from "../../../utils/toast";
import { Meta } from "../../ui/Typography/Typography";
import { AudioResultFrame } from "./AudioResultFrame";

interface TranscriptResultProps {
  result: SpeechResult;
}

/** The last transcription: the transcript in a read-only field, with Copy. */
export function TranscriptResult({ result }: TranscriptResultProps) {
  const text = result.text ?? "";

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(TRANSCRIPT_COPIED_TITLE))
      .catch((err: unknown) => toast.error("Could not copy the transcript", errorMessage(err)));
  };

  return (
    <AudioResultFrame
      title={TRANSCRIBE_RESULT_TITLE}
      result={result}
      failedMessage={TRANSCRIBE_FAILED_MESSAGE}
      action={
        <Button appearance="secondary" onClick={copy} disabled={text === ""}>
          Copy
        </Button>
      }
    >
      <Textarea aria-label="Transcript" readOnly resize="vertical" rows={6} value={text} />
      {text === "" && <Meta>{NO_SPEECH_MESSAGE}</Meta>}
    </AudioResultFrame>
  );
}
