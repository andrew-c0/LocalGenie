import { Button, Textarea } from "@fluentui/react-components";
import { SendRegular, StopRegular } from "@fluentui/react-icons";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { useFitTextarea } from "../../../hooks/useFitTextarea";
import { Flex } from "../Flex/Flex";
import { Meta } from "../Typography/Typography";
import "./MessageComposer.css";

/** The message box grows from one row up to this many rows, then scrolls. */
const MAX_INPUT_ROWS = 5;

/** The button at the end of the field: Send when idle, Stop while a reply runs. */
export type ComposerAction =
  | { kind: "send"; disabled: boolean; onSend: () => void }
  | { kind: "stop"; label: string; onStop: () => void };

export interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter without Shift. The caller decides whether that sends. */
  onSubmit: () => void;
  placeholder: string;
  /** Turns the field off. The buttons follow their own `action`. */
  disabled: boolean;
  /** A control before the field, in the same row: the chat's attach button. */
  leading?: ReactNode;
  action: ComposerAction;
  /** A line under the field: why the message cannot be sent, or that it waits in a queue. */
  note?: string | null;
  /** The row under the field: the tools chip. The row takes no space when this renders nothing. */
  tools?: ReactNode;
}

/**
 * The message field shared by the chat and Dispatch: the field grows with its text, Enter sends and Shift+Enter
 * starts a line, and the square Send or Stop button sits beside it. A note and a tools row go under it. The
 * chat adds its attach button as `leading`; the owner decides what sending does.
 */
export function MessageComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  leading,
  action,
  note,
  tools,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useFitTextarea(textareaRef, value, MAX_INPUT_ROWS);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="message-composer">
      <div
        className={
          leading
            ? "message-composer__wrapper message-composer__wrapper--leading"
            : "message-composer__wrapper"
        }
      >
        {leading}
        <Textarea
          ref={textareaRef}
          className="message-composer__field"
          resize="none"
          value={value}
          onChange={(_, data) => onChange(data.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label="Message"
        />
        {action.kind === "stop" ? (
          <Button
            type="button"
            appearance="secondary"
            className="message-composer__button"
            onClick={action.onStop}
            title={action.label}
            aria-label={action.label}
          >
            <StopRegular />
          </Button>
        ) : (
          <Button
            type="button"
            appearance="primary"
            className="message-composer__button"
            onClick={action.onSend}
            disabled={action.disabled}
            aria-label="Send message"
          >
            <SendRegular />
          </Button>
        )}
      </div>
      {note && <Meta>{note}</Meta>}
      <Flex className="message-composer__toolbar" align="center" gap="s">
        {tools}
      </Flex>
    </div>
  );
}
