import type { ReactNode } from "react";
import "./ConversationCanvas.css";

interface ConversationCanvasProps {
  children: ReactNode;
}

/**
 * The frame of a conversation page (the chat and Dispatch): it fills the page and its children stack in a
 * column. The header actions sit in the breadcrumb row; below come the landing or the transcript, then the
 * message field.
 */
export function ConversationCanvas({ children }: ConversationCanvasProps) {
  return <div className="conversation-canvas">{children}</div>;
}
