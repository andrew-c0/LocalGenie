import type { ChatSession, DispatchPatch, DispatchStatus, DispatchTask } from "../types";
import type { TrayActivity } from "./trayStatus";

/** The session title and the tray line keep this many characters of the first message. */
export const TITLE_MAX_CHARS = 60;

/** The reply preview in a desktop notice keeps this many characters. */
export const ANSWER_NOTICE_MAX_CHARS = 80;

/** The title of the desktop notice a finished turn sends. */
export const TURN_NOTICE_TITLE = "Dispatch replied";

/**
 * Compaction threshold of every Dispatch session, as a per-chat override: on, at this share of the window.
 * The backend writes the same override when it creates the session.
 */
export const DISPATCH_COMPACTION_THRESHOLD = 70;

/** How a turn ended. `done` carries the reply's text; `stopped` is not a failure: the user asked for it. */
export type TurnEnd =
  | { status: "done"; answer: string }
  | { status: "failed"; error: string }
  | { status: "stopped" };

/** The first `max` characters of the trimmed text. Counts characters, not UTF-16 units. */
export function cutChars(text: string, max: number): string {
  return Array.from(text.trim()).slice(0, max).join("");
}

/**
 * A turn is in progress and holds the model: it runs, or it waits for the user's approval of a tool call
 * (needs_you). Both block the chat input and count as working for the tray and Exit.
 */
export function isWorking(status: DispatchStatus): boolean {
  return status === "running" || status === "needs_you";
}

/** A conversation is busy: its turn is in progress or it waits in the queue. The Stop button shows then. */
export function isBusy(status: DispatchStatus): boolean {
  return isWorking(status) || status === "queued";
}

/** Continue starts a stopped or interrupted conversation again from its stored messages. */
export function canContinue(status: DispatchStatus): boolean {
  return status === "interrupted" || status === "stopped";
}

/** The id of the conversation whose turn runs now (status running), or null. */
export function runningTaskIdOf(tasks: readonly DispatchTask[]): string | null {
  return tasks.find((task) => isWorking(task.status))?.id ?? null;
}

/**
 * The chat session of a conversation as the store holds it, before its first message. It carries the same
 * title and compaction override the backend stores for a new conversation.
 */
export function newDispatchSession(task: DispatchTask): ChatSession {
  return {
    id: task.sessionId,
    title: cutChars(task.goal, TITLE_MAX_CHARS),
    messages: [],
    contextChars: 0,
    createdAt: task.createdAt,
    updatedAt: task.createdAt,
    pinned: false,
    kind: "dispatch",
    settingsOverrides: { compaction: true, compactionThreshold: DISPATCH_COMPACTION_THRESHOLD },
  };
}

/** The desktop notice for a finished turn, or null when it gets none (a stop is the user's own doing). */
export function turnNotice(end: TurnEnd): { title: string; body: string } | null {
  switch (end.status) {
    case "stopped":
      return null;
    case "failed":
      return { title: TURN_NOTICE_TITLE, body: `Dispatch stopped: ${end.error}` };
    case "done":
      return {
        title: TURN_NOTICE_TITLE,
        body: cutChars(end.answer, ANSWER_NOTICE_MAX_CHARS) || "The reply has no text.",
      };
  }
}

/** The title of the desktop notice that asks the user to approve a tool call. */
export const APPROVAL_NOTICE_TITLE = "Dispatch needs your approval";

/** The desktop notice for a tool call that waits for the user: the tool, then the conversation's title. */
export function approvalNotice(goal: string, toolName: string): { title: string; body: string } {
  return {
    title: APPROVAL_NOTICE_TITLE,
    body: `${toolName} in ${cutChars(goal, TITLE_MAX_CHARS)}`,
  };
}

/** The tray line of a working conversation, or null otherwise. */
export function dispatchActivityOf(task: DispatchTask): TrayActivity | null {
  if (!isWorking(task.status)) return null;
  const title = cutChars(task.goal, TITLE_MAX_CHARS);
  const what =
    task.status === "needs_you" ? `waiting for your approval on ${title}` : `working on ${title}`;
  return { id: task.id, label: `Dispatch: ${what}` };
}

/** The fields `dispatch_update` writes when a turn ends. The finish time is always set. */
export function patchForEnd(end: TurnEnd, finishedAt: number): DispatchPatch {
  switch (end.status) {
    case "done":
      return { status: "done", report: end.answer, error: null, finishedAt };
    case "failed":
      return { status: "failed", error: end.error, finishedAt };
    case "stopped":
      return { status: "stopped", finishedAt };
  }
}

/** The conversation as the store should hold it after a turn end, for when the save failed. */
export function taskWithEnd(task: DispatchTask, end: TurnEnd, finishedAt: number): DispatchTask {
  return {
    ...task,
    status: end.status,
    finishedAt,
    report: end.status === "done" ? end.answer : task.report,
    error: end.status === "failed" ? end.error : null,
  };
}
