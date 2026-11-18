import type { ActiveStream } from "../types";

/*
 * Which conversation owns the model's work. A chat reply streams under its session (`activeStream`). Between two
 * requests of a chat's tool run no stream is open, so the run's session (`toolRunSessionId`) stands for it. A Dispatch
 * turn is neither: its session is held by the Dispatch store, so it never counts as a chat's. A summary is owned by the
 * session it was started for (`compactingSessionId`).
 */

/** True when the open stream is this session's reply. */
export function streamBelongsTo(stream: ActiveStream | null, sessionId: string): boolean {
  return stream !== null && stream.sessionId === sessionId;
}

/**
 * True when this chat owns the reply in progress: its stream is open, or its tool run is between two requests. A
 * null session (no chat open) owns nothing.
 */
export function replyBelongsTo(
  stream: ActiveStream | null,
  toolRunSessionId: string | null,
  sessionId: string | null,
): boolean {
  if (sessionId === null) return false;
  if (stream !== null) return stream.sessionId === sessionId;
  return toolRunSessionId === sessionId;
}

/** True when the running summary was started for this session. */
export function summaryBelongsTo(compactingSessionId: string | null, sessionId: string): boolean {
  return compactingSessionId === sessionId;
}
