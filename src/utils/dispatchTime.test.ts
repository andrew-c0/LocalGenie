import { describe, expect, it } from "vitest";
import { ageLabel, elapsedMsOf, formatElapsed, type TurnTimes } from "./dispatchTime";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

const IDLE: TurnTimes = { status: "stopped", startedAt: null, finishedAt: null };

describe("elapsedMsOf", () => {
  it("is null before any turn started", () => {
    expect(elapsedMsOf(IDLE, NOW)).toBeNull();
    expect(elapsedMsOf({ ...IDLE, status: "queued" }, NOW)).toBeNull();
  });

  it("runs to now while the turn works", () => {
    expect(elapsedMsOf({ status: "running", startedAt: NOW - 90_000, finishedAt: null }, NOW)).toBe(
      90_000,
    );
  });

  it("ignores an earlier end while a new turn works", () => {
    const task: TurnTimes = {
      status: "running",
      startedAt: NOW - 30_000,
      finishedAt: NOW - 10 * MIN,
    };
    expect(elapsedMsOf(task, NOW)).toBe(30_000);
  });

  it("stops at the end of a finished turn", () => {
    const task: TurnTimes = {
      status: "done",
      startedAt: NOW - 10 * MIN,
      finishedAt: NOW - 4 * MIN,
    };
    expect(elapsedMsOf(task, NOW)).toBe(6 * MIN);
  });

  it("is never negative when the clock is behind the start", () => {
    expect(elapsedMsOf({ status: "running", startedAt: NOW + 1000, finishedAt: null }, NOW)).toBe(
      0,
    );
  });
});

describe("formatElapsed", () => {
  it("shows seconds, then minutes and seconds, then hours and minutes", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45_900)).toBe("45s");
    expect(formatElapsed(3 * MIN + 12_000)).toBe("3m 12s");
    expect(formatElapsed(HOUR + 5 * MIN + 30_000)).toBe("1h 5m");
  });

  it("treats a negative duration as zero", () => {
    expect(formatElapsed(-500)).toBe("0s");
  });
});

describe("ageLabel", () => {
  it("reads a recent moment as just now", () => {
    expect(ageLabel(NOW - 20_000, NOW)).toBe("just now");
    expect(ageLabel(NOW + 5000, NOW)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(ageLabel(NOW - 5 * MIN, NOW)).toBe("5 min ago");
    expect(ageLabel(NOW - 3 * HOUR, NOW)).toBe("3 h ago");
  });

  it("falls back to the day count after a day", () => {
    expect(ageLabel(NOW - 3 * DAY, NOW)).toBe("3 days ago");
  });
});
