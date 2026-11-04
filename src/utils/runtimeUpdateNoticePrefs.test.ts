import { describe, expect, it } from "vitest";
import {
  NOTIFY_RUNTIME_UPDATES_DEFAULT,
  resolveNotifiedRuntimeUpdates,
  resolveNotifyRuntimeUpdates,
} from "./runtimeUpdateNoticePrefs";

describe("resolveNotifyRuntimeUpdates", () => {
  it("is on when nothing is stored", () => {
    expect(NOTIFY_RUNTIME_UPDATES_DEFAULT).toBe(true);
    expect(resolveNotifyRuntimeUpdates(null)).toBe(true);
    expect(resolveNotifyRuntimeUpdates(undefined)).toBe(true);
  });

  it("keeps a stored boolean, including off", () => {
    expect(resolveNotifyRuntimeUpdates(false)).toBe(false);
    expect(resolveNotifyRuntimeUpdates(true)).toBe(true);
  });

  it("falls back to the default for a value of the wrong type", () => {
    expect(resolveNotifyRuntimeUpdates("false")).toBe(true);
    expect(resolveNotifyRuntimeUpdates(0)).toBe(true);
  });
});

describe("resolveNotifiedRuntimeUpdates", () => {
  it("is empty when nothing is stored", () => {
    expect(resolveNotifiedRuntimeUpdates(null)).toEqual({});
    expect(resolveNotifiedRuntimeUpdates(undefined)).toEqual({});
  });

  it("keeps the stored runtime versions", () => {
    expect(resolveNotifiedRuntimeUpdates({ geniex: "1.1.0", "sd-cpp": "0.3.0" })).toEqual({
      geniex: "1.1.0",
      "sd-cpp": "0.3.0",
    });
  });

  it("drops entries that are not a version text", () => {
    expect(
      resolveNotifiedRuntimeUpdates({ geniex: "1.1.0", blank: "  ", count: 3, nothing: null }),
    ).toEqual({ geniex: "1.1.0" });
  });

  it("reads a list, a text or a number as nothing notified", () => {
    expect(resolveNotifiedRuntimeUpdates(["1.1.0"])).toEqual({});
    expect(resolveNotifiedRuntimeUpdates("geniex")).toEqual({});
    expect(resolveNotifiedRuntimeUpdates(7)).toEqual({});
  });
});
