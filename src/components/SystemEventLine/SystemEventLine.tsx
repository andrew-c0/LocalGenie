import { ArrowSyncRegular, ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import type { Message } from "../../types";
import { isSummaryMessage } from "../../utils/compaction";
import { shortName } from "../../utils/format";
import { MODEL_CHANGED, parseSystemContent } from "../../utils/systemEvents";
import { MarkdownContent } from "../ui/MarkdownContent/MarkdownContent";
import { Meta } from "../ui/Typography/Typography";
import "./SystemEventLine.css";

interface SystemEventLineProps {
  message: Message;
}

/** The line shown for a summary row. Its content is the summary, which opens under the line. */
const SUMMARY_TEXT = "Conversation summarised";

/** The text of a model-change line, from its content fields. */
function modelChangedText(fields: Record<string, unknown>): string | null {
  if (typeof fields.model !== "string") return null;
  const compute = typeof fields.compute === "string" ? ` on ${fields.compute.toUpperCase()}` : "";
  return `Model: ${shortName(fields.model)}${compute}`;
}

/**
 * A line in the chat for something that happened, such as the model changing. It is centred and
 * muted, not a bubble, and each type of line sets its own text. A summary row is a button that opens
 * the summary text under the line.
 */
export default function SystemEventLine({ message }: SystemEventLineProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const time = new Date(message.timestamp).toLocaleTimeString();

  if (isSummaryMessage(message)) {
    return (
      <>
        <button
          type="button"
          className="system-event system-event--toggle"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded((open) => !open)}
        >
          <ArrowSyncRegular className="system-event__icon" aria-hidden />
          <Meta>{SUMMARY_TEXT}</Meta>
          <Meta>{time}</Meta>
          {expanded ? <ChevronUpRegular aria-hidden /> : <ChevronDownRegular aria-hidden />}
        </button>
        {expanded && (
          <div id={detailId} className="system-event__summary">
            <MarkdownContent>{message.content}</MarkdownContent>
          </div>
        )}
      </>
    );
  }

  const fields = parseSystemContent(message.content);
  let text: string | null = null;
  if (message.systemType === MODEL_CHANGED) text = modelChangedText(fields);
  // A line of an unknown type, or one whose fields are missing, shows the text it was saved with.
  const label: ReactNode =
    text ?? (typeof fields.text === "string" ? fields.text : message.content);

  return (
    <div className="system-event" role="note">
      <ArrowSyncRegular className="system-event__icon" aria-hidden />
      <Meta>{label}</Meta>
      <Meta>{time}</Meta>
    </div>
  );
}
