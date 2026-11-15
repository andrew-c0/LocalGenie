import { describe, expect, it } from "vitest";
import type { DownloadStatus } from "../stores/downloadStore";
import {
  downloadsFinished,
  TRAY_TOOLTIP_MAX_LENGTH,
  type TrayActivity,
  trayTooltip,
} from "./trayStatus";

const activity = (id: string, label: string, percent?: number): TrayActivity => ({
  id,
  label,
  percent,
});

describe("trayTooltip", () => {
  it("is null when nothing is active", () => {
    expect(trayTooltip([])).toBeNull();
  });

  it("shows one activity with its percent", () => {
    expect(trayTooltip([activity("a", "Downloading Qwen3 4B", 42)])).toBe(
      "Downloading Qwen3 4B 42%",
    );
  });

  it("shows one activity without a percent when it is unknown", () => {
    expect(trayTooltip([activity("a", "Importing Qwen3 4B")])).toBe("Importing Qwen3 4B");
  });

  it("names the first activity and counts the rest", () => {
    const activities = [
      activity("a", "Downloading Qwen3 4B", 42),
      activity("b", "Downloading Phi", 10),
      activity("c", "Installing GenieX"),
    ];
    expect(trayTooltip(activities)).toBe("Downloading Qwen3 4B 42% (+2 more)");
  });

  it("omits the percent of the first activity when it is unknown", () => {
    const activities = [activity("a", "Importing Qwen3 4B"), activity("b", "Downloading Phi", 5)];
    expect(trayTooltip(activities)).toBe("Importing Qwen3 4B (+1 more)");
  });

  it("clamps and rounds the percent", () => {
    expect(trayTooltip([activity("a", "Downloading X", 41.6)])).toBe("Downloading X 42%");
    expect(trayTooltip([activity("a", "Downloading X", 140)])).toBe("Downloading X 100%");
  });

  it("cuts a long label with an ellipsis and keeps the percent and count", () => {
    const longLabel = `Downloading ${"very long model name ".repeat(10)}`;
    const tooltip = trayTooltip([activity("a", longLabel, 7), activity("b", "Phi")]);
    expect(tooltip).not.toBeNull();
    expect(tooltip?.endsWith("… 7% (+1 more)")).toBe(true);
    expect(tooltip?.length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX_LENGTH);
  });

  it("keeps every result within the limit", () => {
    const longLabel = "x".repeat(300);
    const tooltip = trayTooltip([activity("a", longLabel, 100), activity("b", longLabel)]);
    expect(tooltip?.length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX_LENGTH);
  });
});

describe("downloadsFinished", () => {
  const entry = (id: string, status: DownloadStatus) => ({
    id,
    status,
  });

  it("returns the downloads that moved to finished", () => {
    const previous = [entry("a", "downloading"), entry("b", "importing")];
    const next = [entry("a", "finished"), entry("b", "finished")];
    expect(downloadsFinished(previous, next)).toEqual([
      entry("a", "finished"),
      entry("b", "finished"),
    ]);
  });

  it("does not return a download that was already finished", () => {
    const previous = [entry("a", "finished")];
    const next = [entry("a", "finished")];
    expect(downloadsFinished(previous, next)).toEqual([]);
  });

  it("does not return downloads that did not finish", () => {
    const previous = [entry("a", "queued")];
    const next = [entry("a", "downloading"), entry("b", "error")];
    expect(downloadsFinished(previous, next)).toEqual([]);
  });

  it("returns a finished download that was not in the previous snapshot", () => {
    expect(downloadsFinished([], [entry("a", "finished")])).toEqual([entry("a", "finished")]);
  });

  it("reports a download again when it finishes after being requeued", () => {
    const previous = [entry("a", "finished")];
    const requeued = [entry("a", "queued")];
    const finishedAgain = [entry("a", "finished")];
    expect(downloadsFinished(previous, requeued)).toEqual([]);
    expect(downloadsFinished(requeued, finishedAgain)).toEqual([entry("a", "finished")]);
  });
});
