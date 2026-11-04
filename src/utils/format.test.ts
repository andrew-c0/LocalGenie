import { describe, expect, it } from "vitest";
import {
  countLabel,
  formatBytes,
  formatContextLength,
  formatDay,
  formatEta,
  formatFullDate,
  formatGigabytes,
  formatRelativeDate,
  formatWhole,
  rateLabel,
} from "./format";

describe("countLabel", () => {
  it("uses the singular for exactly one", () => {
    expect(countLabel(1, "run", "runs")).toBe("1 run");
  });

  it("uses the plural for zero and for more than one", () => {
    expect(countLabel(0, "run", "runs")).toBe("0 runs");
    expect(countLabel(7, "run", "runs")).toBe("7 runs");
  });

  it("works with a multi-word noun", () => {
    expect(countLabel(1, "model installed", "models installed")).toBe("1 model installed");
    expect(countLabel(3, "model installed", "models installed")).toBe("3 models installed");
  });
});

describe("formatWhole", () => {
  it("groups the thousands", () => {
    expect(formatWhole(40960)).toBe("40,960");
    expect(formatWhole(0)).toBe("0");
  });

  it("shows a dash when the number is unknown", () => {
    expect(formatWhole(null)).toBe("—");
    expect(formatWhole(undefined)).toBe("—");
  });
});

describe("formatDay", () => {
  it("shows the day of an ISO date, without a time", () => {
    const text = formatDay("2025-04-28T10:24:13.000Z");
    expect(text).toContain("2025");
    expect(text).not.toMatch(/:\d\d/);
  });

  it("returns null for a missing or invalid date", () => {
    expect(formatDay(null)).toBeNull();
    expect(formatDay(undefined)).toBeNull();
    expect(formatDay("not a date")).toBeNull();
  });
});

describe("formatGigabytes", () => {
  it("shows gigabytes with one decimal", () => {
    expect(formatGigabytes(16.3 * 1_073_741_824)).toBe("16.3 GB");
  });

  it("shows a dash when the size is unknown", () => {
    expect(formatGigabytes(null)).toBe("—");
    expect(formatGigabytes(undefined)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("shows gigabytes with two decimals", () => {
    expect(formatBytes(4 * 1_073_741_824)).toBe("4.00 GB");
  });

  it("shows megabytes, kilobytes and bytes below those", () => {
    expect(formatBytes(5 * 1_048_576)).toBe("5.0 MB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("shows a dash for a missing size", () => {
    expect(formatBytes(undefined)).toBe("—");
  });
});

describe("formatRelativeDate", () => {
  const NOW = Date.parse("2026-11-03T12:00:00Z");
  const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

  it("says today for the same day and for a future date", () => {
    expect(formatRelativeDate(daysAgo(0), NOW)).toBe("today");
    expect(formatRelativeDate(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe("today");
    expect(formatRelativeDate(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe("today");
  });

  it("takes epoch milliseconds as well as an ISO string", () => {
    expect(formatRelativeDate(NOW - 3 * 86_400_000, NOW)).toBe("3 days ago");
    expect(formatRelativeDate(NOW, NOW)).toBe("today");
  });

  it("counts days below a week", () => {
    expect(formatRelativeDate(daysAgo(1), NOW)).toBe("1 day ago");
    expect(formatRelativeDate(daysAgo(3), NOW)).toBe("3 days ago");
    expect(formatRelativeDate(daysAgo(6), NOW)).toBe("6 days ago");
  });

  it("counts weeks below a month", () => {
    expect(formatRelativeDate(daysAgo(7), NOW)).toBe("1 week ago");
    expect(formatRelativeDate(daysAgo(14), NOW)).toBe("2 weeks ago");
    expect(formatRelativeDate(daysAgo(29), NOW)).toBe("4 weeks ago");
  });

  it("counts months below a year", () => {
    expect(formatRelativeDate(daysAgo(30), NOW)).toBe("1 month ago");
    expect(formatRelativeDate(daysAgo(150), NOW)).toBe("5 months ago");
    expect(formatRelativeDate(daysAgo(359), NOW)).toBe("11 months ago");
  });

  it("counts years from a year on, never showing 12 months", () => {
    expect(formatRelativeDate(daysAgo(362), NOW)).toBe("1 year ago");
    expect(formatRelativeDate(daysAgo(730), NOW)).toBe("2 years ago");
  });

  it("returns null for a missing or invalid date", () => {
    expect(formatRelativeDate(null, NOW)).toBeNull();
    expect(formatRelativeDate(undefined, NOW)).toBeNull();
    expect(formatRelativeDate("", NOW)).toBeNull();
    expect(formatRelativeDate("not a date", NOW)).toBeNull();
  });
});

describe("formatFullDate", () => {
  it("shows the full date with its year", () => {
    expect(formatFullDate("2026-08-14T09:30:00Z")).toContain("2026");
  });

  it("returns null for a missing or invalid date", () => {
    expect(formatFullDate(null)).toBeNull();
    expect(formatFullDate(undefined)).toBeNull();
    expect(formatFullDate("nope")).toBeNull();
  });
});

describe("formatContextLength", () => {
  it("shows a window of 1K or more in thousands of tokens", () => {
    expect(formatContextLength(8192)).toBe("8K");
    expect(formatContextLength(131072)).toBe("128K");
    expect(formatContextLength(1024)).toBe("1K");
  });

  it("shows a window under 1K as the raw count", () => {
    expect(formatContextLength(512)).toBe("512");
  });

  it("returns null when the length is missing or zero", () => {
    expect(formatContextLength(null)).toBeNull();
    expect(formatContextLength(undefined)).toBeNull();
    expect(formatContextLength(0)).toBeNull();
  });
});

describe("formatEta", () => {
  it("shows seconds under a minute", () => {
    expect(formatEta(450, 10)).toBe("45s");
  });

  it("shows minutes and seconds under an hour", () => {
    expect(formatEta(184 * 10, 10)).toBe("3m 4s");
  });

  it("shows hours and minutes from an hour", () => {
    expect(formatEta(3720 * 10, 10)).toBe("1h 2m");
  });

  it("is a dash while the speed or the remaining bytes are unknown", () => {
    expect(formatEta(100, 0)).toBe("—");
    expect(formatEta(0, 10)).toBe("—");
  });
});

describe("rateLabel", () => {
  it("shows the speed and the time left when the size is known", () => {
    expect(rateLabel(1024 * 1024, 184 * 1024 * 1024)).toBe("1.0 MB/s · ETA 3m 4s");
  });

  it("shows only the speed when the size is not known", () => {
    expect(rateLabel(1024 * 1024, null)).toBe("1.0 MB/s");
  });
});
