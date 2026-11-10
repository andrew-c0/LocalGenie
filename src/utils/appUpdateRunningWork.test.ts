import { describe, expect, it } from "vitest";
import { type RunningWorkSnapshot, runningWorkLines } from "./appUpdateRunningWork";

const idle: RunningWorkSnapshot = {
  chatReplyStreaming: false,
  playgroundImageJob: false,
  playgroundSpeechJob: false,
  ocrJob: false,
  benchmarkRunning: false,
  activeDownloads: [],
  runtimeRemoving: false,
};

describe("runningWorkLines", () => {
  it("is empty when nothing runs", () => {
    expect(runningWorkLines(idle)).toEqual([]);
  });

  it("lists each running chat, Playground, OCR and benchmark job", () => {
    expect(
      runningWorkLines({
        ...idle,
        chatReplyStreaming: true,
        playgroundImageJob: true,
        playgroundSpeechJob: true,
        ocrJob: true,
        benchmarkRunning: true,
      }),
    ).toEqual([
      "A chat reply is streaming.",
      "A Playground image job is running.",
      "A Playground speech job is running.",
      "An OCR job is running.",
      "A benchmark run is in progress.",
    ]);
  });

  it("lists one line per active download, by its label", () => {
    expect(
      runningWorkLines({ ...idle, activeDownloads: ["org/model-a", "GenieX runtime"] }),
    ).toEqual([
      "Downloading or importing org/model-a.",
      "Downloading or importing GenieX runtime.",
    ]);
  });

  it("lists a runtime being uninstalled", () => {
    expect(runningWorkLines({ ...idle, runtimeRemoving: true })).toEqual([
      "A runtime is being uninstalled.",
    ]);
  });
});
