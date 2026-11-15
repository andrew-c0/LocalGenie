import { describe, expect, it } from "vitest";
import type { DownloadItem } from "../stores/downloadStore";
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
