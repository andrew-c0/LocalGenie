import { describe, expect, it } from "vitest";
import type { PlaygroundDownloadProgress } from "../types";
import {
  advancePlaygroundTransfer,
  type PlaygroundTransfer,
  playgroundTotalBytes,
} from "./playgroundTransfer";

const event = (
  fileIndex: number,
  received: number,
  total: number,
  fileCount = 2,
): PlaygroundDownloadProgress => ({
  modelId: "m",
  fileName: `file-${fileIndex}.bin`,
  fileIndex,
  fileCount,
  received,
  total,
});

/** Feed events one second apart, from `start` ms. */
function run(events: PlaygroundDownloadProgress[], start = 0): PlaygroundTransfer {
  return events.reduce<PlaygroundTransfer | null>(
    (state, progress, i) => advancePlaygroundTransfer(state, progress, start + i * 1000),
    null,
  ) as PlaygroundTransfer;
}

describe("advancePlaygroundTransfer", () => {
  it("counts the bytes of the current file from the first event, with no speed yet", () => {
    const t = advancePlaygroundTransfer(null, event(0, 500, 1000), 0);
    expect(t.doneBytes).toBe(0);
    expect(t.sample.received).toBe(500);
    expect(t.sample.speed).toBe(0);
  });

  it("measures the speed between two events of one file", () => {
    const t = run([event(0, 0, 1000), event(0, 500, 1000)]);
    expect(t.sample.speed).toBe(500);
  });

  it("keeps the count rising when the backend moves on to the next file", () => {
    const t = run([event(0, 800, 1000), event(1, 100, 400)]);
    expect(t.doneBytes).toBe(1000);
    expect(t.sample.received).toBe(1100);
  });

  it("uses the file's size for the bytes it finished with, not the last count", () => {
    const t = run([event(0, 600, 1000), event(1, 0, 400)]);
    expect(t.doneBytes).toBe(1000);
  });

  it("does not report a negative speed across a file change", () => {
    const t = run([event(0, 900, 1000), event(1, 0, 400)]);
    expect(t.sample.speed).toBeGreaterThanOrEqual(0);
    expect(t.sample.received).toBeGreaterThanOrEqual(900);
  });
});

describe("playgroundTotalBytes", () => {
  it("is unknown while an earlier file runs, even with its own size known", () => {
    expect(playgroundTotalBytes(run([event(0, 100, 1000)]))).toBeNull();
  });

  it("is the sum of the finished files and the last file's size on the last file", () => {
    expect(playgroundTotalBytes(run([event(0, 1000, 1000), event(1, 100, 400)]))).toBe(1400);
  });

  it("is known from the start for a single-file download", () => {
    expect(playgroundTotalBytes(run([event(0, 100, 1000, 1)]))).toBe(1000);
  });

  it("is unknown on the last file while its size is not reported", () => {
    expect(playgroundTotalBytes(run([event(0, 1000, 1000), event(1, 10, 0)]))).toBeNull();
  });
});
