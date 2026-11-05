import { describe, expect, it } from "vitest";
import {
  axisStep,
  axisTicks,
  barCountFor,
  barHeightPx,
  bucketPeaks,
  clampSeconds,
  formatClock,
  MAX_BARS,
  mixChannels,
  peakLevel,
  percentToTime,
  seekBy,
  seekForKey,
  timeToPercent,
} from "./audioWaveform";

describe("bucketPeaks", () => {
  it("gives no buckets for no samples or no buckets", () => {
    expect(bucketPeaks(new Float32Array(0), 10)).toEqual([]);
    expect(bucketPeaks(Float32Array.from([0.5]), 0)).toEqual([]);
  });

  it("takes the lowest and highest sample of each even share of the samples", () => {
    const peaks = bucketPeaks(Float32Array.from([0.25, -0.5, 0.75, 1]), 2);
    expect(peaks).toEqual([
      { min: -0.5, max: 0.25 },
      { min: 0.75, max: 1 },
    ]);
  });

  it("gives one bucket per sample when there are more buckets than samples", () => {
    const peaks = bucketPeaks(Float32Array.from([0.25, -0.5, 0.5]), 10);
    expect(peaks).toEqual([
      { min: 0.25, max: 0.25 },
      { min: -0.5, max: -0.5 },
      { min: 0.5, max: 0.5 },
    ]);
  });

  it("covers every sample exactly once when the samples do not divide evenly", () => {
    const samples = Float32Array.from([1, 2, 3, 4, 5, 6, 7]);
    const peaks = bucketPeaks(samples, 3);
    expect(peaks).toHaveLength(3);
    expect(peaks.map((peak) => peak.max)).toEqual([2, 4, 7]);
    expect(peaks.map((peak) => peak.min)).toEqual([1, 3, 5]);
  });
});

describe("peakLevel and barHeightPx", () => {
  it("reads the loudest side of a bucket, between 0 and 1", () => {
    expect(peakLevel({ min: -0.5, max: 0.3 })).toBe(0.5);
    expect(peakLevel({ min: 0, max: 0 })).toBe(0);
    expect(peakLevel({ min: -2, max: 0.1 })).toBe(1);
  });

  it("scales a level to the full height, with a minimum so silence still shows", () => {
    expect(barHeightPx(0.5, 80, 2)).toBe(40);
    expect(barHeightPx(1, 80, 2)).toBe(80);
    expect(barHeightPx(0, 80, 2)).toBe(2);
  });
});

describe("barCountFor", () => {
  it("fits one bar per bar width plus gap", () => {
    expect(barCountFor(400)).toBe(100);
  });

  it("gives no bars without a width", () => {
    expect(barCountFor(0)).toBe(0);
    expect(barCountFor(-5)).toBe(0);
  });

  it("caps the bar count", () => {
    expect(barCountFor(100_000)).toBe(MAX_BARS);
  });
});

describe("mixChannels", () => {
  it("averages the channels sample by sample", () => {
    expect(mixChannels([Float32Array.from([1, 2]), Float32Array.from([3, 4])])).toEqual(
      Float32Array.from([2, 3]),
    );
  });

  it("keeps one channel as it is, and gives an empty array for none", () => {
    const mono = Float32Array.from([1, 2, 3]);
    expect(mixChannels([mono])).toBe(mono);
    expect(mixChannels([])).toEqual(new Float32Array(0));
  });
});

describe("formatClock", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("drops the fraction of a second", () => {
    expect(formatClock(3599.9)).toBe("59:59");
  });

  it("reads a missing, negative or not-a-number time as zero", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("clampSeconds and seekBy", () => {
  it("keeps a time between zero and the duration", () => {
    expect(clampSeconds(-1, 10)).toBe(0);
    expect(clampSeconds(12, 10)).toBe(10);
    expect(clampSeconds(4, 10)).toBe(4);
  });

  it("leaves the top open while the duration is not known", () => {
    expect(clampSeconds(5, 0)).toBe(5);
    expect(clampSeconds(5, Number.NaN)).toBe(5);
  });

  it("moves by a delta and stays inside the clip", () => {
    expect(seekBy(3, -10, 60)).toBe(0);
    expect(seekBy(55, 10, 60)).toBe(60);
    expect(seekBy(20, 10, 60)).toBe(30);
  });
});

describe("seekForKey", () => {
  it("moves five seconds with the arrows, ten with Shift", () => {
    expect(seekForKey(10, "ArrowLeft", false, 60)).toBe(5);
    expect(seekForKey(10, "ArrowRight", false, 60)).toBe(15);
    expect(seekForKey(10, "ArrowLeft", true, 60)).toBe(0);
    expect(seekForKey(10, "ArrowRight", true, 60)).toBe(20);
  });

  it("jumps to the start and the end", () => {
    expect(seekForKey(30, "Home", false, 60)).toBe(0);
    expect(seekForKey(30, "End", false, 60)).toBe(60);
  });

  it("gives null for a key it does not handle", () => {
    expect(seekForKey(30, "a", false, 60)).toBeNull();
    expect(seekForKey(30, " ", false, 60)).toBeNull();
  });
});

describe("timeToPercent and percentToTime", () => {
  it("maps a time to a percentage of the duration", () => {
    expect(timeToPercent(15, 60)).toBe(25);
    expect(timeToPercent(120, 60)).toBe(100);
    expect(timeToPercent(0, 0)).toBe(0);
  });

  it("maps a percentage back to a time, kept inside the clip", () => {
    expect(percentToTime(50, 60)).toBe(30);
    expect(percentToTime(150, 60)).toBe(60);
    expect(percentToTime(-5, 60)).toBe(0);
    expect(percentToTime(50, 0)).toBe(0);
  });
});

describe("axisStep and axisTicks", () => {
  it("picks the first round step that leaves few enough ticks", () => {
    expect(axisStep(60, 6)).toBe(15);
    expect(axisStep(3, 8)).toBe(1);
  });

  it("gives ticks from zero to the duration at that step", () => {
    expect(axisTicks(10, 6)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(axisTicks(3, 8)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(60, 6)).toEqual([0, 15, 30, 45, 60]);
  });

  it("keeps a long clip to a few ticks", () => {
    const ticks = axisTicks(7200, 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks[0]).toBe(0);
  });

  it("gives no ticks without a duration", () => {
    expect(axisTicks(0, 6)).toEqual([]);
    expect(axisTicks(Number.NaN, 6)).toEqual([]);
  });
});
