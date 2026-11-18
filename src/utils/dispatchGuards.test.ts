import { describe, expect, it } from "vitest";
import {
  CYCLE_LIMIT,
  CYCLE_NUDGE_TEXT,
  ERROR_SNIPPET_CHARS,
  FAILURE_LIMIT,
  freshStallState,
  judgeCall,
  judgeResult,
  NUDGE_LIMIT,
  REPEAT_LIMIT,
  REPEAT_NUDGE_TEXT,
  type StallState,
} from "./dispatchGuards";

const READ = { name: "read_text_file", arguments: '{"path":"a.txt"}' };
const LIST = { name: "list_directory", arguments: '{"path":"C:/notes"}' };
const OTHER_READ = { name: READ.name, arguments: '{"path":"b.txt"}' };

/** A list call for a folder no other call uses, so it never repeats. */
function freshList(index: number) {
  return { name: LIST.name, arguments: JSON.stringify({ path: `dir${index}` }) };
}

/** Runs calls through the guard one after another, keeping the state, and returns each verdict's kind. */
function kindsOf(calls: { name: string; arguments: string }[]): string[] {
  let state: StallState = freshStallState();
  return calls.map((call) => {
    const verdict = judgeCall(state, call);
    state = verdict.state;
    return verdict.kind;
  });
}

describe("limits", () => {
  it("are named and set to 3 repeats in a row, 2 runs per turn, 3 nudges and 6 failures", () => {
    expect(REPEAT_LIMIT).toBe(3);
    expect(CYCLE_LIMIT).toBe(2);
    expect(NUDGE_LIMIT).toBe(3);
    expect(FAILURE_LIMIT).toBe(6);
  });
});

describe("judgeCall", () => {
  it("runs the first calls, including three identical ones in a row", () => {
    expect(kindsOf([READ, READ, READ])).toEqual(["run", "run", "run"]);
  });

  it("does not run the fourth identical call, and gives the nudge text", () => {
    let state = freshStallState();
    for (let i = 0; i < REPEAT_LIMIT; i++) state = judgeCall(state, READ).state;
    const verdict = judgeCall(state, READ);
    expect(verdict).toMatchObject({ kind: "repeat", nudge: REPEAT_NUDGE_TEXT, stop: null });
    expect(REPEAT_NUDGE_TEXT).toContain("You already made this exact call 3 times");
    expect(REPEAT_NUDGE_TEXT).toContain("Try a different approach, or answer with what you have.");
  });

  it("ends the turn on the third nudge, naming the tool", () => {
    let state = freshStallState();
    const stops: (string | null)[] = [];
    for (let i = 0; i < REPEAT_LIMIT + NUDGE_LIMIT; i++) {
      const verdict = judgeCall(state, READ);
      state = verdict.state;
      if (verdict.kind === "repeat") stops.push(verdict.stop);
    }
    expect(stops).toEqual([
      null,
      null,
      "The model kept repeating the same tool call (read_text_file). Send a message to continue.",
    ]);
  });

  it("does not count the same name with other arguments as a repeat", () => {
    expect(kindsOf([READ, OTHER_READ, READ, OTHER_READ])).toEqual(["run", "run", "run", "run"]);
  });

  it("keeps the nudge count for the whole turn, so a different call in between does not reset it", () => {
    // Four repeats: the fourth is nudged. A different call runs. Then READ is nudged again: it ran twice before.
    const calls = [READ, READ, READ, READ, LIST, READ, READ];
    expect(kindsOf(calls)).toEqual(["run", "run", "run", "repeat", "run", "repeat", "repeat"]);
    let state = freshStallState();
    for (const call of calls.slice(0, 4)) state = judgeCall(state, call).state;
    expect(state.nudges).toBe(1);
    for (const call of calls.slice(4)) state = judgeCall(state, call).state;
    expect(state.nudges).toBe(3);
  });
});

describe("judgeCall cycle", () => {
  it("does not run a call the third time when it ran twice, not in a row", () => {
    expect(kindsOf([READ, LIST, READ, LIST, READ])).toEqual(["run", "run", "run", "run", "repeat"]);
  });

  it("gives the cycle nudge text for a non-consecutive repeat, with no stop yet", () => {
    let state = freshStallState();
    for (const call of [READ, LIST, READ, LIST]) state = judgeCall(state, call).state;
    expect(judgeCall(state, READ)).toMatchObject({
      kind: "repeat",
      nudge: CYCLE_NUDGE_TEXT,
      stop: null,
    });
    expect(CYCLE_NUDGE_TEXT).toContain(`You already made this exact call ${CYCLE_LIMIT} times`);
    expect(CYCLE_NUDGE_TEXT).toContain("dispatch_notes");
  });

  it("counts cycle nudges toward the nudge limit and ends the turn on the third", () => {
    // READ runs twice, then is nudged three times, each time with a different call in between.
    const calls = [
      READ,
      freshList(0),
      READ,
      freshList(1),
      READ,
      freshList(2),
      READ,
      freshList(3),
      READ,
    ];
    let state = freshStallState();
    const verdicts = calls.map((call) => {
      const verdict = judgeCall(state, call);
      state = verdict.state;
      return verdict;
    });
    expect(verdicts.map((verdict) => verdict.kind)).toEqual([
      "run",
      "run",
      "run",
      "run",
      "repeat",
      "run",
      "repeat",
      "run",
      "repeat",
    ]);
    const stops = verdicts.flatMap((verdict) => (verdict.kind === "repeat" ? [verdict.stop] : []));
    expect(stops).toEqual([
      null,
      null,
      "The model kept repeating the same tool call (read_text_file). Send a message to continue.",
    ]);
  });

  it("does not count a call with other arguments toward the cycle of the first", () => {
    expect(kindsOf([READ, LIST, READ, LIST, OTHER_READ])).toEqual([
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
  });

  it("does not let a call that was not run start a streak, so the next identical call is still judged", () => {
    expect(kindsOf([READ, LIST, READ, LIST, READ, READ])).toEqual([
      "run",
      "run",
      "run",
      "run",
      "repeat",
      "repeat",
    ]);
  });

  it("a streak still runs up to the repeat limit, even after the call ran twice before", () => {
    // READ ran once, then LIST, then READ runs again (twice in all), then READ runs a third time in a row.
    expect(kindsOf([READ, LIST, READ, READ, READ])).toEqual(["run", "run", "run", "run", "run"]);
  });
});

describe("judgeResult", () => {
  const failing = (state: StallState, content = "boom") => judgeResult(state, "error", content);

  it("ends the turn on the sixth error in a row, quoting the last error", () => {
    let state = freshStallState();
    for (let i = 0; i < FAILURE_LIMIT - 1; i++) {
      const judged = failing(state, `error ${i}`);
      expect(judged.stop).toBeNull();
      state = judged.state;
    }
    const last = failing(state, "Connection refused");
    expect(last.stop).toBe(
      "6 tool calls in a row failed. Last error: Connection refused. Send a message to continue.",
    );
  });

  it("shortens a long error to the snippet length", () => {
    const long = "x".repeat(ERROR_SNIPPET_CHARS + 50);
    const stop = failing({ ...freshStallState(), failures: FAILURE_LIMIT - 1 }, long).stop;
    expect(stop).toBe(
      `6 tool calls in a row failed. Last error: ${"x".repeat(ERROR_SNIPPET_CHARS)}. Send a message to continue.`,
    );
  });

  it("says no message when the error text is empty", () => {
    const stop = failing({ ...freshStallState(), failures: FAILURE_LIMIT - 1 }, "  ").stop;
    expect(stop).toContain("Last error: no message.");
  });

  it("a successful result resets the error streak", () => {
    let state = freshStallState();
    for (let i = 0; i < FAILURE_LIMIT - 1; i++) state = failing(state).state;
    state = judgeResult(state, "ok", "fine").state;
    expect(state.failures).toBe(0);
    expect(failing(state).stop).toBeNull();
  });

  it("a denied or cancelled result also ends the streak, since it is not an error", () => {
    let state = freshStallState();
    for (let i = 0; i < FAILURE_LIMIT - 1; i++) state = failing(state).state;
    state = judgeResult(state, "denied", "The user denied this call.").state;
    expect(state.failures).toBe(0);
  });
});
