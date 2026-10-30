import type { SpeechResult } from "../../../../types";
import { NO_ENHANCE_OUTPUT_MESSAGE } from "../../../../utils/audioText";
import { speechTimingLabel } from "../../../../utils/speech";
import { speechCancelledText } from "../../../../utils/speechText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { AudioOutputPlayer } from "./AudioOutputPlayer";

interface EnhanceResultProps {
  result: SpeechResult;
}

/** The last audio to audio job: one labelled player per saved file, and how long it took. */
export function EnhanceResult({ result }: EnhanceResultProps) {
  if (result.status === "error") {
    return (
      <SurfaceCard title="Result">
        <ErrorBanner message={result.error ?? "The audio could not be processed."} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title="Result">
        <Body>{speechCancelledText(result.kind)}</Body>
      </SurfaceCard>
    );
  }

  const timing = speechTimingLabel(result.elapsedSeconds, result.audioSeconds);

  return (
    <SurfaceCard title="Result">
      <Flex direction="column" gap="l">
        {result.outputs.length === 0 && <ErrorBanner message={NO_ENHANCE_OUTPUT_MESSAGE} />}
        {result.outputs.map((output) => (
          <AudioOutputPlayer key={output.path} output={output} />
        ))}
        {timing && <Meta>{timing}</Meta>}
      </Flex>
    </SurfaceCard>
  );
}
