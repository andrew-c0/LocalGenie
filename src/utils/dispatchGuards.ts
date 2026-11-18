import type { ToolStatus } from "../types";
import { cutChars } from "./dispatchTask";

/** Identical calls in a row that run. The call after them is not run: the model is asked to stop repeating it. */
export const REPEAT_LIMIT = 3;

/** Runs of one exact call in a turn, not in a row. The next run after this many is not run: the model is asked to stop. */
export const CYCLE_LIMIT = 2;

/** Repeated calls that were not run, in one turn. The next one after this many ends the turn as failed. */
export const NUDGE_LIMIT = 3;

/** Error results in a row, in one turn, that end the turn as failed. */
export const FAILURE_LIMIT = 6;

/** The longest error text the stop message quotes. */
export const ERROR_SNIPPET_CHARS = 160;

/** The result the model gets for a call repeated in a row past REPEAT_LIMIT, which was not run. */
export const REPEAT_NUDGE_TEXT = `You already made this exact call ${REPEAT_LIMIT} times with the same result. Do not repeat it. Try a different approach, or answer with what you have.`;

/** The result the model gets for a call it already ran CYCLE_LIMIT times in the turn, which was not run. */
export const CYCLE_NUDGE_TEXT = `You already made this exact call ${CYCLE_LIMIT} times in this turn. The result is no longer in your context: it is in your notes if you saved it. Do not repeat it. Use dispatch_notes to record findings as you go, then continue with a different step or answer with what you have.`;

/** The result of a call the turn ended before it could run. */
export const NOT_RUN_TEXT = "Not run: the turn ended before this call.";

/**
 * What the stall guard remembers of a turn: the last run call's identity and how many times it has run in a row,
 * how many times each exact call has run in the whole turn, how many repeated calls were not run, and how many error
 * results have come in a row.
 */
export interface StallState {
  lastKey: string | null;
  repeats: number;
  /** Runs of each call, by its key, in the whole turn. */
  ran: Record<string, number>;
  nudges: number;
  failures: number;
}

/** The state at the start of a turn. */
export function freshStallState(): StallState {
  return { lastKey: null, repeats: 0, ran: {}, nudges: 0, failures: 0 };
}

/** The call the guard compares: its tool name and the arguments string the model sent. */
export interface CallSignature {
  name: string;
  arguments: string;
}

/**
 * The guard's verdict on one call. `run`: the call runs. `repeat`: it does not run; `nudge` is the result the model
 * gets, and `stop` is set when this was the last nudge, so the turn ends with that reason.
 */
export type CallJudgement =
  | { kind: "run"; state: StallState }
  | { kind: "repeat"; state: StallState; nudge: string; stop: string | null };

/**
 * The verdict on a call, given the state before it. A call is identical to the last run call when its name and
 * arguments match. A call that was not run leaves the streak as it was.
 */
export function judgeCall(state: StallState, call: CallSignature): CallJudgement {
  const key = JSON.stringify([call.name, call.arguments]);
  const nudge = nudgeFor(state, key);
  if (nudge === null) {
    const repeats = key === state.lastKey ? state.repeats + 1 : 1;
    const ran = { ...state.ran, [key]: (state.ran[key] ?? 0) + 1 };
    return { kind: "run", state: { ...state, lastKey: key, repeats, ran } };
  }

  const nudges = state.nudges + 1;
  return {
    kind: "repeat",
    state: { ...state, nudges },
    nudge,
    stop: nudges >= NUDGE_LIMIT ? repeatStopMessage(call.name) : null,
  };
}

/**
 * The result the model gets instead of running the call, or null when the call runs. A call in the streak runs up to
 * REPEAT_LIMIT times in a row, so the streak is checked first. Any other call does not run once it ran CYCLE_LIMIT times.
 */
function nudgeFor(state: StallState, key: string): string | null {
  if (key === state.lastKey) return state.repeats + 1 > REPEAT_LIMIT ? REPEAT_NUDGE_TEXT : null;
  return (state.ran[key] ?? 0) >= CYCLE_LIMIT ? CYCLE_NUDGE_TEXT : null;
}

/** The verdict after a call that ran: an error adds to the streak; any other status ends it. */
export function judgeResult(
  state: StallState,
  status: ToolStatus,
  content: string,
): { state: StallState; stop: string | null } {
  if (status !== "error") return { state: { ...state, failures: 0 }, stop: null };
  const failures = state.failures + 1;
  return {
    state: { ...state, failures },
    stop: failures >= FAILURE_LIMIT ? failureStopMessage(content) : null,
  };
}

/** The turn's failure when the model kept repeating one call after the nudges. */
export function repeatStopMessage(toolName: string): string {
  return `The model kept repeating the same tool call (${toolName}). Send a message to continue.`;
}

/** The turn's failure when the calls failed in a row. The last error is quoted, shortened. */
export function failureStopMessage(lastError: string): string {
  const snippet = cutChars(lastError, ERROR_SNIPPET_CHARS) || "no message";
  return `${FAILURE_LIMIT} tool calls in a row failed. Last error: ${snippet}. Send a message to continue.`;
}
