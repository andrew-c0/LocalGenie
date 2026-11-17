import type { StoredModelSettings } from "../types";
import { SAMPLING_RANGES } from "./modelSettings";

/** Preference key: the Dispatch sampling profile, stored as JSON. */
export const DISPATCH_SAMPLING_KEY = "dispatch_sampling";

/**
 * The sampling every Dispatch conversation runs with, whatever model is loaded. An optional field left
 * unset keeps the model's own value. Load settings (context size, compute) are never part of it.
 */
export type DispatchSampling = {
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  topK?: number;
  minP?: number;
  maxTokens?: number;
};

/** Used until the user saves a profile, and when the stored one is not valid. */
export const DISPATCH_SAMPLING_DEFAULTS: DispatchSampling = {
  temperature: 0.3,
  topP: 0.9,
  repetitionPenalty: 1.05,
};

const REQUIRED_KEYS = ["temperature", "topP", "repetitionPenalty"] as const;
const OPTIONAL_KEYS = ["topK", "minP", "maxTokens"] as const;
const WHOLE_NUMBER_KEYS: ReadonlySet<keyof DispatchSampling> = new Set(["topK", "maxTokens"]);

const LABELS: Record<keyof DispatchSampling, string> = {
  temperature: "Temperature",
  topP: "Top P",
  repetitionPenalty: "Repetition penalty",
  topK: "Top K",
  minP: "Min P",
  maxTokens: "Max tokens",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the value is a number inside the model settings' bounds for that key (whole for Top K and Max tokens). */
function isInRange(key: keyof DispatchSampling, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (WHOLE_NUMBER_KEYS.has(key) && !Number.isInteger(value)) return false;
  const range = SAMPLING_RANGES[key];
  return value >= range.min && value <= range.max;
}

function rangeMessage(key: keyof DispatchSampling): string {
  const range = SAMPLING_RANGES[key];
  const whole = WHOLE_NUMBER_KEYS.has(key) ? " (a whole number)" : "";
  return `${LABELS[key]} must be between ${range.min} and ${range.max}${whole}.`;
}

/**
 * Why a profile is not valid, as a message for the card, or null when it is. The three required fields must
 * be set. An optional field may be left out (undefined), but when it is set it must be in range.
 */
export function dispatchSamplingProblem(profile: Record<string, unknown>): string | null {
  for (const key of REQUIRED_KEYS) {
    if (!isInRange(key, profile[key])) return rangeMessage(key);
  }
  for (const key of OPTIONAL_KEYS) {
    const value = profile[key];
    if (value !== undefined && !isInRange(key, value)) return rangeMessage(key);
  }
  return null;
}

function numberAt(
  source: Record<string, unknown>,
  key: keyof DispatchSampling,
): number | undefined {
  const value = source[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * The profile from a stored value. A value that is missing, not an object, or has any field out of range reads
 * as the defaults as a whole, so a bad value never mixes with good ones.
 */
export function parseDispatchSampling(stored: unknown): DispatchSampling {
  if (!isRecord(stored) || dispatchSamplingProblem(stored) !== null) {
    return { ...DISPATCH_SAMPLING_DEFAULTS };
  }
  return {
    temperature: numberAt(stored, "temperature") ?? DISPATCH_SAMPLING_DEFAULTS.temperature,
    topP: numberAt(stored, "topP") ?? DISPATCH_SAMPLING_DEFAULTS.topP,
    repetitionPenalty:
      numberAt(stored, "repetitionPenalty") ?? DISPATCH_SAMPLING_DEFAULTS.repetitionPenalty,
    topK: numberAt(stored, "topK"),
    minP: numberAt(stored, "minP"),
    maxTokens: numberAt(stored, "maxTokens"),
  };
}

/** True when two profiles hold the same values. An unset optional field equals another unset one. */
export function sameDispatchSampling(a: DispatchSampling, b: DispatchSampling): boolean {
  return [...REQUIRED_KEYS, ...OPTIONAL_KEYS].every((key) => a[key] === b[key]);
}

/**
 * The model's settings with the Dispatch profile on top. An optional field the profile leaves unset keeps the
 * model's value. The chat's own overrides are applied after this, so they still win.
 */
export function withDispatchSampling(
  settings: StoredModelSettings,
  profile: DispatchSampling,
): StoredModelSettings {
  return {
    ...settings,
    temperature: profile.temperature,
    topP: profile.topP,
    repetitionPenalty: profile.repetitionPenalty,
    ...(profile.topK !== undefined ? { topK: profile.topK } : {}),
    ...(profile.minP !== undefined ? { minP: profile.minP } : {}),
    ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
  };
}
