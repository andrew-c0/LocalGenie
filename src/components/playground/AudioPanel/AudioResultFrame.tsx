import type { ReactNode } from "react";
import type { SpeechResult } from "../../../types";
import { speechCancelledText } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { Body, BodyStrong } from "../../ui/Typography/Typography";

interface AudioResultFrameProps {
  title: string;
  result: SpeechResult;
  /** Shown on the title row for a finished job. */
  action?: ReactNode;
  /** The finished job's content. Shown only when the job finished. */
  children: ReactNode;
}

/**
 * The frame of a job's result in the Audio stage: its title, then the finished content, or the cancelled line. A failed
 * job is not framed here: the stage does not show it, and its toast gives the reason. Every task's result uses this frame,
 * so the three read the same way.
 */
export function AudioResultFrame({ title, result, action, children }: AudioResultFrameProps) {
  const finished = result.status === "ok";
  return (
    <Flex direction="column" gap="s">
      <Flex justify="between" align="center" gap="m" wrap>
        <BodyStrong>{title}</BodyStrong>
        {finished && action}
      </Flex>
      {result.status === "cancelled" && <Body>{speechCancelledText(result.kind)}</Body>}
      {finished && children}
    </Flex>
  );
}
