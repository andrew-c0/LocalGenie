/**
 * Pure helpers for the waveform player: how samples become bars, how times are shown and moved, and where the time
 * axis ticks fall. No DOM and no AudioContext here (decoding lives in the player's own folder).
 */

/** The lowest and highest sample of one bucket of audio, each between -1 and 1. */
export interface Peak {
  min: number;
  max: number;
}

/** A bar is this wide, with this gap before the next one. */
export const BAR_WIDTH_PX = 2;
export const BAR_GAP_PX = 2;

/** More bars than this are not drawn: a very wide player would otherwise draw thousands of rectangles. */
export const MAX_BARS = 1200;

/** Arrow keys move the playhead by this many seconds; with Shift they move by the larger step. */
export const SEEK_STEP_SECONDS = 5;
export const SEEK_STEP_SHIFT_SECONDS = 10;

/** The back and forward buttons move by this many seconds. */
export const SKIP_SECONDS = 10;

/** The time axis picks the first of these steps (seconds) that leaves few enough ticks. */
const AXIS_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** How many bars fit a drawn width. Zero when there is no width yet. */
export function barCountFor(width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(MAX_BARS, Math.floor(width / (BAR_WIDTH_PX + BAR_GAP_PX)));
}

/**
 * The peaks of `count` buckets of `samples`, in order. Each bucket covers an even share of the samples. With more
 * buckets than samples, every sample is its own bucket, so the result is never longer than the samples.
 */
export function bucketPeaks(samples: Float32Array, count: number): Peak[] {
  if (samples.length === 0 || count <= 0) return [];
  const bucketTotal = Math.min(count, samples.length);
  const peaks: Peak[] = [];
  for (let bucket = 0; bucket < bucketTotal; bucket++) {
    const start = Math.floor((bucket * samples.length) / bucketTotal);
    const end = Math.floor(((bucket + 1) * samples.length) / bucketTotal);
    peaks.push(peakOf(samples, start, end));
  }
  return peaks;
}

/** The lowest and highest value of `samples` from `start` up to `end` (exclusive). `end` is always after `start`. */
function peakOf(samples: Float32Array, start: number, end: number): Peak {
  let min = samples[start] ?? 0;
  let max = min;
  for (let index = start + 1; index < end; index++) {
    const value = samples[index] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/** The loudest excursion of a bucket as a level from 0 to 1. */
export function peakLevel(peak: Peak): number {
  return Math.min(1, Math.max(Math.abs(peak.min), Math.abs(peak.max)));
}

/** A bar's height in pixels: its level of the full height, never below the minimum so silence still shows a dot. */
export function barHeightPx(level: number, maxPx: number, minPx: number): number {
  return Math.max(minPx, Math.min(1, level) * maxPx);
}

/** Mixes channels into one by averaging them. One channel is returned as it is. */
export function mixChannels(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (first === undefined) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mixed = new Float32Array(first.length);
  for (const channel of channels) {
    for (let index = 0; index < mixed.length; index++) {
      mixed[index] += (channel[index] ?? 0) / channels.length;
    }
  }
  return mixed;
}

/** A time as `m:ss`, e.g. `1:05`. A missing, negative or not-a-number time reads as zero. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

/**
 * A time kept inside the clip: never below zero, and never past the duration when the duration is known. A duration
 * that is not a positive number (not loaded yet) leaves the top open.
 */
export function clampSeconds(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (Number.isFinite(duration) && duration > 0) return Math.min(seconds, duration);
  return seconds;
}

/** The time `delta` seconds from `current`, kept inside the clip. */
export function seekBy(current: number, delta: number, duration: number): number {
  return clampSeconds(current + delta, duration);
}

/**
 * The time a key press on the playhead moves to, or null when the key is not one it handles. The arrows move by the
 * step (Shift for the larger one); Home and End go to the start and the end.
 */
export function seekForKey(
  current: number,
  key: string,
  shiftKey: boolean,
  duration: number,
): number | null {
  const step = shiftKey ? SEEK_STEP_SHIFT_SECONDS : SEEK_STEP_SECONDS;
  switch (key) {
    case "ArrowLeft":
      return seekBy(current, -step, duration);
    case "ArrowRight":
      return seekBy(current, step, duration);
    case "Home":
      return 0;
    case "End":
      return clampSeconds(duration, duration);
    default:
      return null;
  }
}

/** A time as a percentage of the duration, from 0 to 100. Zero when the duration is not known. */
export function timeToPercent(time: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(100, Math.max(0, (time / duration) * 100));
}

/** The time at a percentage of the duration. The percentage is kept between 0 and 100. */
export function percentToTime(percent: number, duration: number): number {
  if (!(duration > 0)) return 0;
  const clamped = Math.min(100, Math.max(0, percent));
  return (clamped / 100) * duration;
}

/**
 * The gap between time-axis ticks: the first step that leaves at most `maxTicks` ticks (both ends included). When no
 * step is short enough, the longest one is used.
 */
export function axisStep(duration: number, maxTicks: number): number {
  const fits = AXIS_STEPS.find((step) => Math.floor(duration / step) + 1 <= maxTicks);
  return fits ?? AXIS_STEPS[AXIS_STEPS.length - 1] ?? 1;
}

/** The times of the time-axis ticks, from zero up to the duration, at a round step. Empty for no duration. */
export function axisTicks(duration: number, maxTicks: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const step = axisStep(duration, maxTicks);
  const count = Math.floor(duration / step) + 1;
  return Array.from({ length: count }, (_, index) => index * step);
}
