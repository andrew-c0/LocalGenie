import { describe, expect, it } from "vitest";
import type { StoredModelSettings } from "../types";
import {
  applyChatOverrides,
  cleanOverrides,
  overrideCount,
  parseStoredOverrides,
} from "./chatOverrides";

const model: StoredModelSettings = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  nctx: 4096,
  systemBlocks: [{ kind: "text", id: "m", text: "model prompt" }],
};

describe("applyChatOverrides", () => {
  it("keeps the model's settings when the chat sets nothing", () => {
    expect(applyChatOverrides(model, undefined)).toBe(model);
    expect(applyChatOverrides(model, {})).toEqual(model);
  });

  it("replaces only the keys the chat sets and leaves load settings alone", () => {
    const merged = applyChatOverrides(model, { temperature: 0.2, topK: 10 });
    expect(merged.temperature).toBe(0.2);
    expect(merged.topK).toBe(10);
    expect(merged.topP).toBe(0.9);
    expect(merged.nctx).toBe(4096);
  });

  it("replaces the model's system prompt, even with an empty one", () => {
    const merged = applyChatOverrides(model, { systemBlocks: [] });
    expect(merged.systemBlocks).toEqual([]);
  });
});

describe("cleanOverrides", () => {
  it("drops keys that are set to undefined", () => {
    expect(cleanOverrides({ temperature: 0.5, topP: undefined })).toEqual({ temperature: 0.5 });
  });

  it("keeps the compaction overrides, including an off switch", () => {
    expect(cleanOverrides({ compaction: false, compactionThreshold: 85 })).toEqual({
      compaction: false,
      compactionThreshold: 85,
    });
  });
});

describe("applyChatOverrides with compaction", () => {
  it("does not copy the compaction overrides into the model's settings", () => {
    const merged = applyChatOverrides(model, { compaction: true, compactionThreshold: 60 });
    expect(merged).toEqual(model);
  });
});

describe("overrideCount", () => {
  it("counts the settings a chat sets, compaction included", () => {
    expect(overrideCount(undefined)).toBe(0);
    expect(overrideCount({ temperature: 0.5, seed: 7 })).toBe(2);
    expect(overrideCount({ compaction: false })).toBe(1);
  });
});

describe("parseStoredOverrides", () => {
  it("reads a stored object and ignores keys that are not overridable", () => {
    expect(parseStoredOverrides('{"temperature":0.4,"nctx":8192}')).toEqual({ temperature: 0.4 });
  });

  it("treats a missing, empty or unreadable value as no overrides", () => {
    expect(parseStoredOverrides(null)).toBeUndefined();
    expect(parseStoredOverrides("{}")).toBeUndefined();
    expect(parseStoredOverrides("not json")).toBeUndefined();
  });
});
