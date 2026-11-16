import { describe, expect, it } from "vitest";
import type { DownloadItem } from "../stores/downloadStore";
import type { DispatchTask } from "../types";
import { exitBlockers } from "./exitBlockers";

const download = (id: string, status: DownloadItem["status"]): DownloadItem => ({
  id,
  label: id,
  received: 0,
  total: null,
  speed: 0,
  status,
  startedAt: 0,
});

describe("exitBlockers", () => {
  it("has no blockers when nothing is downloading", () => {
    expect(exitBlockers([])).toEqual([]);
    expect(exitBlockers([download("a", "finished"), download("b", "error")])).toEqual([]);
  });

  it("counts queued, downloading and importing downloads in one reason", () => {
    const downloads = [
      download("a", "queued"),
      download("b", "downloading"),
      download("c", "importing"),
      download("d", "cancelled"),
    ];
    expect(exitBlockers(downloads)).toEqual(["3 model downloads in progress"]);
  });

  it("uses the singular for one download", () => {
    expect(exitBlockers([download("a", "downloading")])).toEqual(["1 model download in progress"]);
  });
});

describe("exitBlockers with Dispatch conversations", () => {
  const task = (id: string, status: DispatchTask["status"]): DispatchTask => ({
    id,
    sessionId: `s-${id}`,
    goal: id,
    status,
    allowedTools: [],
    limits: { maxSteps: 0, maxMinutes: 0 },
    notes: "",
    report: null,
    error: null,
    steps: 0,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
  });

  it("names a conversation whose turn runs or waits for approval", () => {
    expect(exitBlockers([], [task("a", "needs_you")])).toEqual([
      "A Dispatch conversation is still working. Exit and stop it?",
    ]);
    expect(exitBlockers([], [task("a", "running")])).toEqual([
      "A Dispatch conversation is still working. Exit and stop it?",
    ]);
  });

  it("does not name queued, ready, stopped or interrupted conversations", () => {
    const tasks = [
      task("a", "queued"),
      task("b", "done"),
      task("c", "stopped"),
      task("d", "interrupted"),
    ];
    expect(exitBlockers([], tasks)).toEqual([]);
  });

  it("names a working conversation once, even with several", () => {
    const tasks = [task("a", "running"), task("b", "running"), task("c", "done")];
    expect(exitBlockers([], tasks)).toHaveLength(1);
  });

  it("lists the download reason before the Dispatch one", () => {
    expect(exitBlockers([download("a", "downloading")], [task("b", "running")])).toEqual([
      "1 model download in progress",
      "A Dispatch conversation is still working. Exit and stop it?",
    ]);
  });
});
