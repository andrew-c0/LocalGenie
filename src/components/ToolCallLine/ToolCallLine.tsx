import { ChevronDownRegular, ChevronUpRegular, WrenchRegular } from "@fluentui/react-icons";
import { useId, useState } from "react";
import type { Message } from "../../types";
import {
  approvalText,
  prettyArguments,
  toolLabel,
  toolStatusText,
  toolTargetSummary,
} from "../../utils/toolLines";
import { Meta } from "../ui/Typography/Typography";
import "./ToolCallLine.css";

interface ToolCallLineProps {
  /** A `tool` row: the result of one tool call, with its record. */
  message: Message;
}

/** Label of a row whose record is missing or damaged. Its result still shows in the details. */
const UNKNOWN_TOOL = "Tool result";

/**
 * A muted line for one tool call, between the messages. It shows the tool, what it worked on and the
 * outcome. Collapsed by default; opening it shows the exact arguments, how the call was approved and the
 * result. A tool line has no actions: it cannot be copied, retried or deleted on its own.
 */
export default function ToolCallLine({ message }: ToolCallLineProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const record = message.toolRecord;

  const label = record ? toolLabel(record.name) : UNKNOWN_TOOL;
  const target = record ? toolTargetSummary(record.arguments) : null;
  const status = record ? toolStatusText(record.status, record.durationMs) : null;

  return (
    <div className="tool-call">
      <button
        type="button"
        className="tool-call__toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((open) => !open)}
      >
        <WrenchRegular className="tool-call__icon" aria-hidden />
        <Meta>{label}</Meta>
        {target && <Meta className="tool-call__target">{target}</Meta>}
        {status && (
          <Meta
            className={
              status.warning ? "tool-call__status tool-call__status--warning" : "tool-call__status"
            }
          >
            {status.text}
          </Meta>
        )}
        {expanded ? <ChevronUpRegular aria-hidden /> : <ChevronDownRegular aria-hidden />}
      </button>

      {expanded && (
        <div id={detailId} className="tool-call__details">
          {record && (
            <>
              <Meta>Arguments</Meta>
              <pre className="tool-call__code">{prettyArguments(record.arguments)}</pre>
              <Meta>Approval: {approvalText(record.approval)}</Meta>
            </>
          )}
          <Meta>Result</Meta>
          <pre className="tool-call__code tool-call__result">{message.content}</pre>
          {record?.truncated && <Meta>The result was cut short to fit the size limit.</Meta>}
        </div>
      )}
    </div>
  );
}
