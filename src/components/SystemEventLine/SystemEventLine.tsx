import { ArrowSyncRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { Message } from "../../types";
import { shortName } from "../../utils/format";
import { MODEL_CHANGED, parseSystemContent } from "../../utils/systemEvents";
import { Meta } from "../ui/Typography/Typography";
import "./SystemEventLine.css";

interface SystemEventLineProps {
  message: Message;
}

/** The text of a model-change line, from its content fields. */
function modelChangedText(fields: Record<string, unknown>): string | null {
  if (typeof fields.model !== "string") return null;
  const compute = typeof fields.compute === "string" ? ` on ${fields.compute.toUpperCase()}` : "";
  return `Model: ${shortName(fields.model)}${compute}`;
}

/**
 * A line in the chat for something that happened, such as the model changing. It is centred and
 * muted, not a bubble, and each type of line sets its own text.
 */
export default function SystemEventLine({ message }: SystemEventLineProps) {
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
      <Meta>{new Date(message.timestamp).toLocaleTimeString()}</Meta>
    </div>
  );
}
