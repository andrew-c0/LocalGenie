import { describe, expect, it } from "vitest";
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  applyDownloadEvent,
  appUpdateNoticeText,
  downloadFraction,
  EMPTY_DOWNLOAD_PROGRESS,
  lastCheckedLabel,
  progressLabel,
  resolveNotifiedAppVersion,
  shouldCheckNow,
  shouldNotify,
  trimReleaseNotes,
} from "./appUpdate";
import { formatBytes } from "./format";

describe("shouldCheckNow", () => {
  const now = 1_000_000_000_000;

  it("checks when no check has run yet", () => {
    expect(shouldCheckNow(null, now)).toBe(true);
  });

  it("waits until six hours have passed since the last check", () => {
    expect(shouldCheckNow(now - APP_UPDATE_CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldCheckNow(now - APP_UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it("checks when the last check time is in the future (clock change)", () => {
    expect(shouldCheckNow(now + 60_000, now)).toBe(true);
  });
});

describe("shouldNotify", () => {
  it("notifies a version that was not notified before", () => {
    expect(shouldNotify("1.2.0", null)).toBe(true);
    expect(shouldNotify("1.2.0", "1.1.0")).toBe(true);
  });

  it("does not notify the version already notified", () => {
    expect(shouldNotify("1.2.0", "1.2.0")).toBe(false);
  });

  it("ignores an empty version", () => {
    expect(shouldNotify("  ", null)).toBe(false);
  });
});

describe("resolveNotifiedAppVersion", () => {
  it("keeps a non-empty text", () => {
    expect(resolveNotifiedAppVersion("1.2.0")).toBe("1.2.0");
  });

  it("reads anything else as nothing notified", () => {
    expect(resolveNotifiedAppVersion("")).toBeNull();
    expect(resolveNotifiedAppVersion("   ")).toBeNull();
    expect(resolveNotifiedAppVersion(3)).toBeNull();
    expect(resolveNotifiedAppVersion(null)).toBeNull();
    expect(resolveNotifiedAppVersion(["1.2.0"])).toBeNull();
  });
});

describe("downloadFraction", () => {
  it("is the share of the total downloaded", () => {
    expect(downloadFraction(25, 100)).toBe(0.25);
  });

  it("is null while the total is not known", () => {
    expect(downloadFraction(25, null)).toBeNull();
    expect(downloadFraction(25, 0)).toBeNull();
  });

  it("stays between 0 and 1", () => {
    expect(downloadFraction(150, 100)).toBe(1);
    expect(downloadFraction(-5, 100)).toBe(0);
  });
});

describe("applyDownloadEvent", () => {
  it("takes the total from the start event", () => {
    const progress = applyDownloadEvent(EMPTY_DOWNLOAD_PROGRESS, {
      kind: "started",
      contentLength: 200,
    });
    expect(progress).toEqual({ downloadedBytes: 0, totalBytes: 200, fraction: 0 });
  });

  it("adds each chunk and updates the fraction", () => {
    let progress = applyDownloadEvent(EMPTY_DOWNLOAD_PROGRESS, {
      kind: "started",
      contentLength: 200,
    });
    progress = applyDownloadEvent(progress, { kind: "progress", chunkLength: 50 });
    progress = applyDownloadEvent(progress, { kind: "progress", chunkLength: 50 });
    expect(progress).toEqual({ downloadedBytes: 100, totalBytes: 200, fraction: 0.5 });
  });

  it("keeps the fraction unknown when the size is unknown", () => {
    let progress = applyDownloadEvent(EMPTY_DOWNLOAD_PROGRESS, {
      kind: "started",
      contentLength: null,
    });
    progress = applyDownloadEvent(progress, { kind: "progress", chunkLength: 10 });
    expect(progress).toEqual({ downloadedBytes: 10, totalBytes: null, fraction: null });
  });

  it("reads as complete when the download finishes", () => {
    const progress = applyDownloadEvent(
      { downloadedBytes: 90, totalBytes: 100, fraction: 0.9 },
      { kind: "finished" },
    );
    expect(progress.fraction).toBe(1);
    expect(progress.downloadedBytes).toBe(90);
  });
});

describe("progressLabel", () => {
  it("shows the downloaded and the total bytes", () => {
    expect(progressLabel({ downloadedBytes: 50, totalBytes: 200, fraction: 0.25 })).toBe(
      `Downloaded ${formatBytes(50)} of ${formatBytes(200)}`,
    );
  });

  it("shows only the downloaded bytes when the total is unknown", () => {
    expect(progressLabel({ downloadedBytes: 50, totalBytes: null, fraction: null })).toBe(
      `Downloaded ${formatBytes(50)}`,
    );
  });
});

describe("trimReleaseNotes", () => {
  it("returns empty text for missing notes", () => {
    expect(trimReleaseNotes(null)).toBe("");
    expect(trimReleaseNotes(undefined)).toBe("");
    expect(trimReleaseNotes("  \n ")).toBe("");
  });

  it("normalises line endings and trims the ends", () => {
    expect(trimReleaseNotes("\r\n## Fixed\r\n- one\r\n")).toBe("## Fixed\n- one");
  });

  it("keeps short notes whole", () => {
    expect(trimReleaseNotes("- one\n- two", 100)).toBe("- one\n- two");
  });

  it("cuts long notes at a line break and marks the cut", () => {
    const notes = `${"a".repeat(30)}\n${"b".repeat(30)}\n${"c".repeat(30)}`;
    const trimmed = trimReleaseNotes(notes, 70);
    expect(trimmed).toBe(`${"a".repeat(30)}\n${"b".repeat(30)}...`);
  });

  it("cuts inside a long line when no line break is near", () => {
    const trimmed = trimReleaseNotes("x".repeat(100), 40);
    expect(trimmed).toBe(`${"x".repeat(40)}...`);
  });
});

describe("appUpdateNoticeText", () => {
  it("names the new version and the current one", () => {
    expect(appUpdateNoticeText("1.2.0", "1.1.0")).toEqual({
      title: "LocalGenie 1.2.0 is available",
      body: "You have 1.1.0. Open Settings > Application & Runtime to download and restart.",
    });
  });
});

describe("lastCheckedLabel", () => {
  it("says so before the first check", () => {
    expect(lastCheckedLabel(null)).toBe("Not checked yet");
  });

  it("gives the time of the last check", () => {
    const at = Date.UTC(2026, 10, 8, 12, 0, 0);
    expect(lastCheckedLabel(at)).toBe(`Last checked ${new Date(at).toLocaleString()}`);
  });
});
