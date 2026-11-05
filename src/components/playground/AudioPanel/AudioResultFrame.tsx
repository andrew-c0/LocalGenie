import type { ReactNode } from "react";
import type { SpeechResult } from "../../../types";
import { speechCancelledText } from "../../../utils/speechText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { Body, BodyStrong } from "../../ui/Typography/Typography";

interface AudioResultFrameProps {
  title: string;
  result: SpeechResult;
  /** Shown when the job failed without a reason of its own. */
  failedMessage: string;
  /** Shown on the title row for a finished job. */
  action?: ReactNode;
  /** The finished job's content. Shown only when the job finished. */
  children: ReactNode;
}

/**
 * The frame of a job's result in the Audio stage: its title, then the finished content, or the failure or the
 * cancelled line. Every task's result uses it, so the three read the same way.
 */
export function AudioResultFrame({
  title,
  result,
  failedMessage,
  action,
  children,
}: AudioResultFrameProps) {
  const finished = result.status === "ok";
  return (
    <Flex direction="column" gap="s">
      <Flex justify="between" align="center" gap="m" wrap>
        <BodyStrong>{title}</BodyStrong>
        {finished && action}
      </Flex>
      {result.status === "error" && <ErrorBanner message={result.error ?? failedMessage} />}
      {result.status === "cancelled" && <Body>{speechCancelledText(result.kind)}</Body>}
      {finished && children}
    </Flex>
  );
}
