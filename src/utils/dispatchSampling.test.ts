import { describe, expect, it } from "vitest";
import type { StoredModelSettings } from "../types";
import { applyChatOverrides } from "./chatOverrides";
import {
  DISPATCH_SAMPLING_DEFAULTS,
  type DispatchSampling,
  dispatchSamplingProblem,
  parseDispatchSampling,
  sameDispatchSampling,
  withDispatchSampling,
} from "./dispatchSampling";

const MODEL: StoredModelSettings = {
  temperature: 0.8,
  topP: 0.95,
  topK: 20,
  minP: 0.1,
  repetitionPenalty: 1.2,
  maxTokens: 4096,
  nctx: 8192,
  ngl: 20,
  think: false,
};

describe("DISPATCH_SAMPLING_DEFAULTS", () => {
  it("is 0.3 temperature, 0.9 top P and 1.05 repetition penalty, with no optional field", () => {
    expect(DISPATCH_SAMPLING_DEFAULTS).toEqual({
      temperature: 0.3,
      topP: 0.9,
      repetitionPenalty: 1.05,
    });
  });

  it("is valid under the same bounds the model settings use", () => {
    expect(dispatchSamplingProblem(DISPATCH_SAMPLING_DEFAULTS)).toBeNull();
  });
});

describe("dispatchSamplingProblem", () => {
  it("accepts a profile at the edges of the bounds", () => {
    expect(
      dispatchSamplingProblem({
        temperature: 2,
        topP: 0,
        repetitionPenalty: 1,
        topK: 100,
        minP: 1,
        maxTokens: 256,
      }),
    ).toBeNull();
  });

  it("rejects a required field that is missing or out of range", () => {
    expect(dispatchSamplingProblem({ topP: 0.9, repetitionPenalty: 1.05 })).toBe(
      "Temperature must be between 0 and 2.",
    );
    expect(dispatchSamplingProblem({ temperature: 0.3, topP: 1.5, repetitionPenalty: 1.05 })).toBe(
      "Top P must be between 0 and 1.",
    );
    expect(dispatchSamplingProblem({ temperature: 0.3, topP: 0.9, repetitionPenalty: 0.5 })).toBe(
      "Repetition penalty must be between 1 and 2.",
    );
  });

  it("rejects an optional field that is set and out of range, but allows it unset", () => {
    const base = { temperature: 0.3, topP: 0.9, repetitionPenalty: 1.05 };
    expect(dispatchSamplingProblem({ ...base, topK: 0 })).toBe(
      "Top K must be between 1 and 100 (a whole number).",
    );
    expect(dispatchSamplingProblem({ ...base, maxTokens: 300.5 })).toBe(
      "Max tokens must be between 256 and 32768 (a whole number).",
    );
    expect(dispatchSamplingProblem({ ...base, minP: undefined })).toBeNull();
  });

  it("rejects text and non-finite numbers", () => {
    expect(
      dispatchSamplingProblem({ temperature: "hot", topP: 0.9, repetitionPenalty: 1 }),
    ).not.toBeNull();
    expect(
      dispatchSamplingProblem({ temperature: Number.NaN, topP: 0.9, repetitionPenalty: 1 }),
    ).not.toBeNull();
  });
});

describe("parseDispatchSampling", () => {
  it("reads a valid stored profile, keeping its optional fields", () => {
    expect(
      parseDispatchSampling({ temperature: 0.5, topP: 0.8, repetitionPenalty: 1.1, topK: 30 }),
    ).toEqual({ temperature: 0.5, topP: 0.8, repetitionPenalty: 1.1, topK: 30 });
  });

  it("reads as the defaults when nothing is stored", () => {
    expect(parseDispatchSampling(null)).toEqual(DISPATCH_SAMPLING_DEFAULTS);
    expect(parseDispatchSampling(undefined)).toEqual(DISPATCH_SAMPLING_DEFAULTS);
  });

  it("reads as the defaults for text, an array or an object with a bad field", () => {
    expect(parseDispatchSampling("0.3")).toEqual(DISPATCH_SAMPLING_DEFAULTS);
    expect(parseDispatchSampling([0.3, 0.9])).toEqual(DISPATCH_SAMPLING_DEFAULTS);
    expect(parseDispatchSampling({ temperature: 9, topP: 0.5, repetitionPenalty: 1 })).toEqual(
      DISPATCH_SAMPLING_DEFAULTS,
    );
  });

  it("does not mix a bad stored value with the good fields beside it", () => {
    expect(
      parseDispatchSampling({ temperature: 0.5, topP: 0.8, repetitionPenalty: 1.1, topK: 500 }),
    ).toEqual(DISPATCH_SAMPLING_DEFAULTS);
  });
});

describe("withDispatchSampling", () => {
  const profile: DispatchSampling = {
    temperature: 0.3,
    topP: 0.9,
    repetitionPenalty: 1.05,
  };

  it("puts the three profile fields over the model's values", () => {
    const merged = withDispatchSampling(MODEL, profile);
    expect(merged).toMatchObject({ temperature: 0.3, topP: 0.9, repetitionPenalty: 1.05 });
  });

  it("keeps the model's topK, minP and maxTokens when the profile leaves them unset", () => {
    const merged = withDispatchSampling(MODEL, profile);
    expect(merged).toMatchObject({ topK: 20, minP: 0.1, maxTokens: 4096 });
  });

  it("uses the profile's optional fields when they are set", () => {
    const merged = withDispatchSampling(MODEL, { ...profile, topK: 5, minP: 0.2, maxTokens: 512 });
    expect(merged).toMatchObject({ topK: 5, minP: 0.2, maxTokens: 512 });
  });

  it("never touches load settings", () => {
    const merged = withDispatchSampling(MODEL, { ...profile, maxTokens: 512 });
    expect(merged).toMatchObject({ nctx: 8192, ngl: 20, think: false });
  });

  it("is applied under the chat's overrides, which still win", () => {
    const merged = applyChatOverrides(withDispatchSampling(MODEL, profile), {
      temperature: 0.9,
    });
    expect(merged.temperature).toBe(0.9);
    expect(merged.topP).toBe(0.9);
  });
});

describe("sameDispatchSampling", () => {
  it("is true for the same values, whatever the order of the keys", () => {
    expect(
      sameDispatchSampling(
        { temperature: 0.3, topP: 0.9, repetitionPenalty: 1.05, topK: 20 },
        { topK: 20, repetitionPenalty: 1.05, topP: 0.9, temperature: 0.3 },
      ),
    ).toBe(true);
  });

  it("is true when both leave an optional field unset, and false when one sets it", () => {
    expect(
      sameDispatchSampling(DISPATCH_SAMPLING_DEFAULTS, {
        ...DISPATCH_SAMPLING_DEFAULTS,
        minP: undefined,
      }),
    ).toBe(true);
    expect(
      sameDispatchSampling(DISPATCH_SAMPLING_DEFAULTS, {
        ...DISPATCH_SAMPLING_DEFAULTS,
        minP: 0.1,
      }),
    ).toBe(false);
  });

  it("is false for a changed required value", () => {
    expect(
      sameDispatchSampling(DISPATCH_SAMPLING_DEFAULTS, {
        ...DISPATCH_SAMPLING_DEFAULTS,
        temperature: 0.5,
      }),
    ).toBe(false);
  });
});
