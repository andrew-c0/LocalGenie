import { Spinner } from "@fluentui/react-components";
import { CheckmarkCircleFilled, CircleRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import {
  type GenerationProgressState,
  generationPhaseRows,
  type PhaseStatus,
} from "../../../../../utils/playground";
import { Flex } from "../../../../ui/Flex/Flex";
import { Body } from "../../../../ui/Typography/Typography";
import "./GenerationPhaseList.css";

const PHASE_MARK: Record<PhaseStatus, ReactNode> = {
  done: <CheckmarkCircleFilled className="generation-phases__mark" aria-hidden />,
  active: <Spinner size="extra-tiny" />,
  pending: <CircleRegular className="generation-phases__mark" aria-hidden />,
};

/** The stages of a generation as a list: finished ones ticked, the running one highlighted. */
export function GenerationPhaseList({ progress }: { progress: GenerationProgressState }) {
  const rows = generationPhaseRows(progress);

  return (
    <Flex
      as="ol"
      direction="column"
      gap="xs"
      className="generation-phases"
      aria-label="Generation phases"
    >
      {rows.map((row) => (
        <Flex
          as="li"
          key={row.phase}
          align="center"
          gap="s"
          className={`generation-phases__row generation-phases__row--${row.status}`}
          aria-current={row.status === "active" ? "step" : undefined}
        >
          {PHASE_MARK[row.status]}
          <Body className="generation-phases__label">{row.label}</Body>
        </Flex>
      ))}
    </Flex>
  );
}
