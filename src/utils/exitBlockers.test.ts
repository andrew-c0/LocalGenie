import { describe, expect, it } from "vitest";
import type { DownloadItem } from "../stores/downloadStore";
import type { DispatchTask } from "../types";
import { exitBlockers, type RunningWork, trayExitAction, windowCloseAction } from "./exitBlockers";

const idle: RunningWork = {
  downloads: [],
  dispatchTasks: [],
  chatBusy: false,
  benchmarkRunning: false,
  playgroundImageJob: false,
  playgroundSpeechJob: false,
  ocrJob: false,
  runtimeUninstalling: false,
  appUpdateBusy: false,
};

const download = (id: string, status: DownloadItem["status"]): DownloadItem => ({
  id,
  label: id,
  received: 0,
  total: null,
  speed: 0,
  status,
  startedAt: 0,
});

const runtimeInstall = (id: string, status: DownloadItem["status"]): DownloadItem => ({
  ...download(`runtime:${id}`, status),
  runtime: { runtimeId: id, displayName: id },
});

const task = (goal: string, status: DispatchTask["status"]): DispatchTask => ({
  id: goal,
  sessionId: `s-${goal}`,
  goal,
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

describe("exitBlockers", () => {
  it("is empty when nothing runs", () => {
    expect(exitBlockers(idle)).toEqual([]);
  });

  it("ignores finished, failed and cancelled downloads", () => {
    const work = {
      ...idle,
      downloads: [download("a", "finished"), download("b", "error"), download("c", "cancelled")],
    };
    expect(exitBlockers(work)).toEqual([]);
  });

  it("counts queued, downloading and importing model downloads in one line", () => {
    const work = {
      ...idle,
      downloads: [
        download("a", "queued"),
        download("b", "downloading"),
        download("c", "importing"),
        download("d", "cancelled"),
      ],
    };
    expect(exitBlockers(work)).toEqual(["3 model downloads in progress"]);
  });

  it("uses the singular for one model download", () => {
    expect(exitBlockers({ ...idle, downloads: [download("a", "downloading")] })).toEqual([
      "1 model download in progress",
    ]);
  });

  it("counts a runtime install apart from the model downloads", () => {
    const work = { ...idle, downloads: [runtimeInstall("geniex", "downloading")] };
    expect(exitBlockers(work)).toEqual(["1 runtime install or update in progress"]);
  });

  it("counts several runtime installs with the plural", () => {
    const work = {
      ...idle,
      downloads: [runtimeInstall("geniex", "importing"), runtimeInstall("sd-cpp", "queued")],
    };
    expect(exitBlockers(work)).toEqual(["2 runtime installs or updates in progress"]);
  });

  it("names a Dispatch conversation that works, by its title", () => {
    expect(
      exitBlockers({ ...idle, dispatchTasks: [task("Summarise the report", "running")] }),
    ).toEqual(['Dispatch conversation "Summarise the report" is working.']);
  });

  it("says a Dispatch conversation waits for approval", () => {
    expect(
      exitBlockers({ ...idle, dispatchTasks: [task("Clean the folder", "needs_you")] }),
    ).toEqual(['Dispatch conversation "Clean the folder" is waiting for your approval.']);
  });

  it("cuts a long Dispatch title", () => {
    const goal = "x".repeat(200);
    const [line] = exitBlockers({ ...idle, dispatchTasks: [task(goal, "running")] });
    expect(line).toBe(`Dispatch conversation "${"x".repeat(60)}" is working.`);
  });

  it("does not name queued, done, stopped or interrupted conversations", () => {
    const work = {
      ...idle,
      dispatchTasks: [
        task("a", "queued"),
        task("b", "done"),
        task("c", "stopped"),
        task("d", "interrupted"),
      ],
    };
    expect(exitBlockers(work)).toEqual([]);
  });

  it("names every working Dispatch conversation", () => {
    const work = {
      ...idle,
      dispatchTasks: [task("First", "running"), task("Second", "needs_you"), task("Third", "done")],
    };
    expect(exitBlockers(work)).toEqual([
      'Dispatch conversation "First" is working.',
      'Dispatch conversation "Second" is waiting for your approval.',
    ]);
  });

  it("names a chat reply or summary that streams", () => {
    expect(exitBlockers({ ...idle, chatBusy: true })).toEqual([
      "A chat reply or summary is still running.",
    ]);
  });

  it("leaves the chat line out for a Dispatch turn, which streams through the chat too", () => {
    const work = {
      ...idle,
      chatBusy: true,
      dispatchTasks: [task("Plan the trip", "running")],
    };
    expect(exitBlockers(work)).toEqual(['Dispatch conversation "Plan the trip" is working.']);
  });

  it("names a benchmark run", () => {
    expect(exitBlockers({ ...idle, benchmarkRunning: true })).toEqual([
      "A benchmark run is in progress.",
    ]);
  });

  it("names each Playground job by its kind", () => {
    expect(exitBlockers({ ...idle, playgroundImageJob: true })).toEqual([
      "A Playground image job is running.",
    ]);
    expect(exitBlockers({ ...idle, playgroundSpeechJob: true })).toEqual([
      "A Playground speech job is running.",
    ]);
    expect(exitBlockers({ ...idle, ocrJob: true })).toEqual(["An OCR job is running."]);
  });

  it("names a runtime being uninstalled", () => {
    expect(exitBlockers({ ...idle, runtimeUninstalling: true })).toEqual([
      "A runtime is being uninstalled.",
    ]);
  });

  it("names an app update being downloaded or installed", () => {
    expect(exitBlockers({ ...idle, appUpdateBusy: true })).toEqual([
      "An app update is being downloaded or installed.",
    ]);
  });

  it("lists several kinds together, in kind order", () => {
    const work: RunningWork = {
      downloads: [download("a", "downloading"), runtimeInstall("geniex", "queued")],
      dispatchTasks: [task("Review", "needs_you")],
      chatBusy: false,
      benchmarkRunning: true,
      playgroundImageJob: true,
      playgroundSpeechJob: false,
      ocrJob: true,
      runtimeUninstalling: true,
      appUpdateBusy: true,
    };
    expect(exitBlockers(work)).toEqual([
      "1 model download in progress",
      "1 runtime install or update in progress",
      'Dispatch conversation "Review" is waiting for your approval.',
      "A benchmark run is in progress.",
      "A Playground image job is running.",
      "An OCR job is running.",
      "A runtime is being uninstalled.",
      "An app update is being downloaded or installed.",
    ]);
  });
});

describe("trayExitAction", () => {
  it("quits at once when nothing runs", () => {
    expect(trayExitAction([])).toBe("quit");
  });

  it("asks first when something runs", () => {
    expect(trayExitAction(["A benchmark run is in progress."])).toBe("confirm");
  });
});

describe("windowCloseAction", () => {
  const running = ["1 model download in progress"];

  it("hides the window with no prompt when the tray setting is on, whatever runs", () => {
    expect(windowCloseAction(true, [])).toBe("hide");
    expect(windowCloseAction(true, running)).toBe("hide");
  });

  it("closes at once when the tray setting is off and nothing runs", () => {
    expect(windowCloseAction(false, [])).toBe("close");
  });

  it("asks first when the tray setting is off and something runs", () => {
    expect(windowCloseAction(false, running)).toBe("confirm");
  });
});
