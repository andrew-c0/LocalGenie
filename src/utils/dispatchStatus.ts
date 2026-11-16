import type { DispatchStatus } from "../types";

/** The colour of a status badge. Same names as the shared StatusBadge tones; the colours live there. */
export type StatusTone = "default" | "blue" | "cyan" | "purple" | "green" | "red";

export interface StatusBadgeInfo {
  label: string;
  tone: StatusTone;
}

/** The header buttons of a conversation. Stop and Send are in the message field, not here. */
export type ConversationAction = "continue" | "delete";

const BADGES: Record<DispatchStatus, StatusBadgeInfo> = {
  queued: { label: "Queued", tone: "default" },
  running: { label: "Working", tone: "blue" },
  needs_you: { label: "Needs you", tone: "purple" },
  done: { label: "Ready", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  stopped: { label: "Stopped", tone: "default" },
  interrupted: { label: "Interrupted", tone: "cyan" },
};

/**
 * The header buttons each status offers. A working, waiting or queued conversation offers none (its message field
 * has Stop). A stopped or interrupted one can continue. Delete is not offered while it is busy.
 */
const ACTIONS: Record<DispatchStatus, readonly ConversationAction[]> = {
  queued: [],
  running: [],
  needs_you: [],
  done: ["delete"],
  failed: ["delete"],
  stopped: ["continue", "delete"],
  interrupted: ["continue", "delete"],
};

/** The label and colour of a conversation's status badge. */
export function statusBadgeOf(status: DispatchStatus): StatusBadgeInfo {
  return BADGES[status];
}

/** The header buttons a conversation in this status offers, in button order. */
export function conversationActionsOf(status: DispatchStatus): readonly ConversationAction[] {
  return ACTIONS[status];
}
