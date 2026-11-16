/** Where a conversation stands in the Dispatch runner: working, queued, or neither. */
export type OwnState = "idle" | "queued" | "working";

/** What a message to a conversation depends on right now. */
export interface TurnState {
  own: OwnState;
  /** A chat reply or summary is in progress (not a Dispatch turn of its own). */
  chatBusy: boolean;
  serverRunning: boolean;
  modelLoaded: boolean;
}

/**
 * Why a message cannot be sent to a conversation now, as the text to show, or null when it can. The
 * conversation itself working or queued refuses it; another conversation running does not (the message
 * is queued then). The runner and the page both use this one function.
 */
export function turnRefusal(state: TurnState): string | null {
  if (state.own === "working") {
    return "This conversation is working. Wait for its reply, or stop it.";
  }
  if (state.own === "queued") {
    return "This conversation is queued. It starts when the running one finishes.";
  }
  if (state.chatBusy) return "Wait for the chat reply to finish before sending.";
  return serverModelRefusal(state);
}

/**
 * Why a turn cannot run on the model now: the server is stopped or no model is loaded. Null when it can.
 * A queued turn that starts later is checked with this too.
 */
export function serverModelRefusal(
  state: Pick<TurnState, "serverRunning" | "modelLoaded">,
): string | null {
  if (!state.serverRunning) return "Start the GenieX server to run a conversation.";
  if (!state.modelLoaded) return "Load a model to run a conversation.";
  return null;
}

/**
 * The line under the field when another conversation runs and this one is idle: the message is queued.
 * Null when nothing runs, or when the running one is this conversation.
 */
export function queuedNoteFor(runningTaskId: string | null, taskId: string | null): string | null {
  if (runningTaskId === null || runningTaskId === taskId) return null;
  return "Another conversation is working. A message sent here is queued and starts when it finishes.";
}

/**
 * The reason a turn fails when the model is not the one it started on: the loaded model changed, or none
 * is loaded. Null when the turn may go on.
 */
export function modelChangeFault(
  startModelId: string | null,
  currentModelId: string | null,
): string | null {
  if (currentModelId === null) {
    return "No model is loaded, so the conversation cannot continue. Load a model and send the message again.";
  }
  if (startModelId !== null && currentModelId !== startModelId) {
    return `The loaded model changed from ${startModelId} to ${currentModelId}. The conversation needs the model it started with.`;
  }
  return null;
}
