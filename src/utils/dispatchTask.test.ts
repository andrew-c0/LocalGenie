import { describe, expect, it } from "vitest";
import type { DispatchTask } from "../types";
import {
  ANSWER_NOTICE_MAX_CHARS,
  approvalNotice,
  canContinue,
  cutChars,
  DISPATCH_COMPACTION_THRESHOLD,
  dispatchActivityOf,
  isBusy,
  isWorking,
  newDispatchSession,
  patchForEnd,
  runningTaskIdOf,
  TITLE_MAX_CHARS,
  taskWithEnd,
  turnNotice,
} from "./dispatchTask";

function task(overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    id: "t1",
    sessionId: "s1",
    goal: "Read the notes",
    status: "queued",
    allowedTools: [],
    limits: { maxSteps: 0, maxMinutes: 0 },
    notes: "",
    report: null,
    error: null,
    steps: 0,
    createdAt: 100,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe("cutChars", () => {
  it("trims and cuts by characters, not UTF-16 units", () => {
    expect(cutChars("  héllo  ", 3)).toBe("hél");
    expect(cutChars("😀😀😀", 2)).toBe("😀😀");
  });

  it("keeps a short text whole", () => {
    expect(cutChars("short", 60)).toBe("short");
  });
});

describe("status predicates", () => {
  it("a running turn or one waiting for approval is working, and holds the model", () => {
    expect(isWorking("running")).toBe(true);
    expect(isWorking("needs_you")).toBe(true);
    expect(isWorking("queued")).toBe(false);
    expect(isWorking("done")).toBe(false);
  });

  it("a running, waiting or queued conversation is busy", () => {
    expect(isBusy("running")).toBe(true);
    expect(isBusy("needs_you")).toBe(true);
    expect(isBusy("queued")).toBe(true);
    expect(isBusy("stopped")).toBe(false);
  });

  it("Continue applies to a stopped or interrupted conversation only", () => {
    expect(canContinue("stopped")).toBe(true);
    expect(canContinue("interrupted")).toBe(true);
    expect(canContinue("done")).toBe(false);
    expect(canContinue("running")).toBe(false);
  });
});

describe("runningTaskIdOf", () => {
  it("is the id of the running conversation, or null", () => {
    expect(runningTaskIdOf([task({ id: "a" }), task({ id: "b", status: "running" })])).toBe("b");
    expect(runningTaskIdOf([task({ status: "queued" })])).toBeNull();
  });
});

describe("newDispatchSession", () => {
  it("titles the session with the first message and sets the compaction override", () => {
    const session = newDispatchSession(task({ goal: "x".repeat(TITLE_MAX_CHARS + 10) }));
    expect(session.title).toHaveLength(TITLE_MAX_CHARS);
    expect(session.kind).toBe("dispatch");
    expect(session.settingsOverrides).toEqual({
      compaction: true,
      compactionThreshold: DISPATCH_COMPACTION_THRESHOLD,
    });
    expect(session.messages).toEqual([]);
  });
});

describe("turnNotice", () => {
  it("titles a reply Dispatch replied, with the first 80 characters of the answer", () => {
    const answer = `  ${"a".repeat(ANSWER_NOTICE_MAX_CHARS + 5)}  `;
    expect(turnNotice({ status: "done", answer })).toEqual({
      title: "Dispatch replied",
      body: "a".repeat(ANSWER_NOTICE_MAX_CHARS),
    });
  });

  it("uses a short line when the reply has no text", () => {
    expect(turnNotice({ status: "done", answer: "  " })).toEqual({
      title: "Dispatch replied",
      body: "The reply has no text.",
    });
  });

  it("says why the turn failed", () => {
    expect(turnNotice({ status: "failed", error: "The server closed." })).toEqual({
      title: "Dispatch replied",
      body: "Dispatch stopped: The server closed.",
    });
  });

  it("sends no notice for a stop, which the user asked for", () => {
    expect(turnNotice({ status: "stopped" })).toBeNull();
  });
});

describe("dispatchActivityOf", () => {
  it("names the working conversation by its title in the tray", () => {
    expect(dispatchActivityOf(task({ goal: "Sort my files", status: "running" }))).toEqual({
      id: "t1",
      label: "Dispatch: working on Sort my files",
    });
  });

  it("says a conversation waiting for approval is waiting for the user", () => {
    expect(dispatchActivityOf(task({ goal: "Sort my files", status: "needs_you" }))).toEqual({
      id: "t1",
      label: "Dispatch: waiting for your approval on Sort my files",
    });
  });

  it("has no tray line when the conversation is not working", () => {
    expect(dispatchActivityOf(task({ status: "queued" }))).toBeNull();
    expect(dispatchActivityOf(task({ status: "done" }))).toBeNull();
  });
});

describe("approvalNotice", () => {
  it("names the tool and the conversation title, cut to 60 characters", () => {
    expect(approvalNotice("Sort my files", "Fetched page")).toEqual({
      title: "Dispatch needs your approval",
      body: "Fetched page in Sort my files",
    });
    expect(approvalNotice("x".repeat(80), "Read file").body).toBe(`Read file in ${"x".repeat(60)}`);
  });
});

describe("patchForEnd", () => {
  it("writes the answer as the report when the turn is done", () => {
    expect(patchForEnd({ status: "done", answer: "All done." }, 9)).toEqual({
      status: "done",
      report: "All done.",
      error: null,
      finishedAt: 9,
    });
  });

  it("writes the error when the turn failed", () => {
    expect(patchForEnd({ status: "failed", error: "boom" }, 9)).toEqual({
      status: "failed",
      error: "boom",
      finishedAt: 9,
    });
  });

  it("writes only the status and finish time for a stop", () => {
    expect(patchForEnd({ status: "stopped" }, 9)).toEqual({ status: "stopped", finishedAt: 9 });
  });
});

describe("taskWithEnd", () => {
  it("holds the end on the conversation when its save failed", () => {
    const next = taskWithEnd(task({ status: "running" }), { status: "failed", error: "x" }, 5);
    expect(next).toMatchObject({ status: "failed", error: "x", finishedAt: 5 });
  });

  it("keeps the earlier report when the turn did not finish with one", () => {
    const next = taskWithEnd(task({ report: "old" }), { status: "stopped" }, 5);
    expect(next).toMatchObject({ status: "stopped", report: "old", error: null });
  });
});
