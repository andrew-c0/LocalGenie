import type { DownloadItem } from "../stores/downloadStore";
import { isDownloadActive } from "../stores/downloadStore";
import type { DispatchTask } from "../types";
import { cutChars, isWorking, TITLE_MAX_CHARS } from "./dispatchTask";

/**
 * What is running now, as the stores report it. Each field is one kind of work that quitting would cut
 * off. Idle models and servers are not part of it.
 */
export interface RunningWork {
  /** Every item in the Downloads drawer. Only the active ones count, and a runtime install is one of them. */
  downloads: readonly DownloadItem[];
  dispatchTasks: readonly DispatchTask[];
  /** The chat store is streaming a reply or writing a summary. A Dispatch turn sets it too (see `exitBlockers`). */
  chatBusy: boolean;
  benchmarkRunning: boolean;
  playgroundImageJob: boolean;
  playgroundSpeechJob: boolean;
  ocrJob: boolean;
  /** A runtime is being uninstalled from its card. */
  runtimeUninstalling: boolean;
  /** An app update is being downloaded or installed. */
  appUpdateBusy: boolean;
}

/**
 * One short line per kind of running work that quitting would stop, in a fixed kind order. Downloads are
 * counted, each Dispatch conversation that works or waits for approval is named by its title, and the other
 * kinds are named once. Empty when nothing runs. A Dispatch turn streams through the chat store too, so while
 * one works the chat line is left out: the conversation is already named.
 */
export function exitBlockers(work: RunningWork): string[] {
  const lines: string[] = [];

  const active = work.downloads.filter((download) => isDownloadActive(download.status));
  const modelDownloads = active.filter((download) => download.runtime === undefined).length;
  const runtimeInstalls = active.length - modelDownloads;
  if (modelDownloads > 0)
    lines.push(`${counted(modelDownloads, "model download", "model downloads")} in progress`);
  if (runtimeInstalls > 0) {
    lines.push(
      `${counted(runtimeInstalls, "runtime install or update", "runtime installs or updates")} in progress`,
    );
  }

  const workingTasks = work.dispatchTasks.filter((task) => isWorking(task.status));
  for (const task of workingTasks) {
    const state = task.status === "needs_you" ? "waiting for your approval" : "working";
    lines.push(`Dispatch conversation "${cutChars(task.goal, TITLE_MAX_CHARS)}" is ${state}.`);
  }

  if (work.chatBusy && workingTasks.length === 0) {
    lines.push("A chat reply or summary is still running.");
  }
  if (work.benchmarkRunning) lines.push("A benchmark run is in progress.");
  if (work.playgroundImageJob) lines.push("A Playground image job is running.");
  if (work.playgroundSpeechJob) lines.push("A Playground speech job is running.");
  if (work.ocrJob) lines.push("An OCR job is running.");
  if (work.runtimeUninstalling) lines.push("A runtime is being uninstalled.");
  if (work.appUpdateBusy) lines.push("An app update is being downloaded or installed.");

  return lines;
}

/** What the tray's Exit does: quit at once when nothing runs, else confirm first. */
export type ExitAction = "quit" | "confirm";

export function trayExitAction(blockers: readonly string[]): ExitAction {
  return blockers.length === 0 ? "quit" : "confirm";
}

/**
 * What a window close request does. With "keep running in the tray" on the window hides and nothing is asked.
 * With it off the window closes at once when nothing runs, else the user confirms first.
 */
export type CloseAction = "close" | "hide" | "confirm";

export function windowCloseAction(
  keepsRunningInTray: boolean,
  blockers: readonly string[],
): CloseAction {
  if (keepsRunningInTray) return "hide";
  return blockers.length === 0 ? "close" : "confirm";
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
