import { describe, expect, it } from "vitest";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";
import {
  noticeText,
  type PendingRuntimeUpdate,
  RUNTIME_UPDATE_CHECK_INTERVAL_MS,
  updatesToNotify,
} from "./runtimeUpdateNotice";

const runtime = (
  id: string,
  displayName: string,
  installedVersion: string | null,
): RuntimeInfo => ({
  id,
  displayName,
  repo: `org/${id}`,
  installedVersion,
});

const update = (
  id: string,
  installedVersion: string | null,
  latestVersion: string,
): RuntimeUpdateInfo => ({
  id,
  installedVersion,
  latestVersion,
  updateAvailable: installedVersion !== null && installedVersion !== latestVersion,
  releaseUrl: `https://example.test/${id}`,
});

describe("updatesToNotify", () => {
  it("lists an installed runtime whose latest release is newer", () => {
    const runtimes = [runtime("geniex", "GenieX CLI", "1.0.0")];
    const updates = { geniex: update("geniex", "1.0.0", "1.1.0") };
    expect(updatesToNotify(runtimes, updates, {})).toEqual([
      { id: "geniex", name: "GenieX CLI", installed: "1.0.0", latest: "1.1.0" },
    ]);
  });

  it("skips a runtime that is not installed", () => {
    const runtimes = [runtime("sd-cpp", "sd.cpp", null)];
    const updates = { "sd-cpp": update("sd-cpp", null, "0.3.0") };
    expect(updatesToNotify(runtimes, updates, {})).toEqual([]);
  });

  it("skips a runtime that is already up to date", () => {
    const runtimes = [runtime("geniex", "GenieX CLI", "1.1.0")];
    const updates = { geniex: update("geniex", "1.1.0", "1.1.0") };
    expect(updatesToNotify(runtimes, updates, {})).toEqual([]);
  });

  it("skips a runtime whose latest version was already notified", () => {
    const runtimes = [runtime("geniex", "GenieX CLI", "1.0.0")];
    const updates = { geniex: update("geniex", "1.0.0", "1.1.0") };
    expect(updatesToNotify(runtimes, updates, { geniex: "1.1.0" })).toEqual([]);
  });

  it("notifies again when a newer version than the notified one appears", () => {
    const runtimes = [runtime("geniex", "GenieX CLI", "1.0.0")];
    const updates = { geniex: update("geniex", "1.0.0", "1.2.0") };
    expect(updatesToNotify(runtimes, updates, { geniex: "1.1.0" })).toEqual([
      { id: "geniex", name: "GenieX CLI", installed: "1.0.0", latest: "1.2.0" },
    ]);
  });

  it("skips a runtime with no update entry (never checked, or the check failed)", () => {
    const runtimes = [runtime("geniex", "GenieX CLI", "1.0.0")];
    expect(updatesToNotify(runtimes, {}, {})).toEqual([]);
  });

  it("keeps every pending runtime, in list order, and leaves out the rest", () => {
    const runtimes = [
      runtime("geniex", "GenieX CLI", "1.0.0"),
      runtime("sd-cpp", "sd.cpp", "0.2.0"),
      runtime("sherpa", "sherpa-onnx", null),
      runtime("ocr", "OCR", "2.0.0"),
    ];
    const updates = {
      geniex: update("geniex", "1.0.0", "1.1.0"),
      "sd-cpp": update("sd-cpp", "0.2.0", "0.3.0"),
      sherpa: update("sherpa", null, "1.0.0"),
      ocr: update("ocr", "2.0.0", "2.0.0"),
    };
    expect(updatesToNotify(runtimes, updates, { "sd-cpp": "0.3.0" }).map((u) => u.id)).toEqual([
      "geniex",
    ]);
  });
});

describe("noticeText", () => {
  const geniex: PendingRuntimeUpdate = {
    id: "geniex",
    name: "GenieX CLI",
    installed: "1.0.0",
    latest: "1.1.0",
  };
  const sdCpp: PendingRuntimeUpdate = {
    id: "sd-cpp",
    name: "sd.cpp",
    installed: "0.2.0",
    latest: "0.3.0",
  };

  it("names the runtime and version for one update, with the installed version", () => {
    expect(noticeText([geniex])).toEqual({
      title: "GenieX CLI 1.1.0 is available",
      body: "Installed 1.0.0. Open Settings > Runtimes to update.",
    });
  });

  it("counts the updates in the title and lists them in the body", () => {
    expect(noticeText([geniex, sdCpp])).toEqual({
      title: "2 runtime updates are available",
      body: "GenieX CLI 1.1.0, sd.cpp 0.3.0. Open Settings > Runtimes to update.",
    });
  });
});

describe("RUNTIME_UPDATE_CHECK_INTERVAL_MS", () => {
  it("is six hours", () => {
    expect(RUNTIME_UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });
});
