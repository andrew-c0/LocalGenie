import { describe, expect, it } from "vitest";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";
import { runtimesWarningOf } from "./runtimeWarning";

function runtime(id: string, installedVersion: string | null): RuntimeInfo {
  return { id, installedVersion } as RuntimeInfo;
}

function update(updateAvailable: boolean): RuntimeUpdateInfo {
  return {
    id: "geniex",
    installedVersion: "1.0.0",
    latestVersion: "1.1.0",
    updateAvailable,
    releaseUrl: "",
  };
}

describe("runtimesWarningOf", () => {
  it("flags that no runtime is installed", () => {
    expect(runtimesWarningOf([runtime("geniex", null), runtime("sd-cpp", null)], {})).toBe(
      "No runtime installed",
    );
  });

  it("does not flag a missing runtime while another is installed", () => {
    expect(runtimesWarningOf([runtime("geniex", null), runtime("sd-cpp", "1.0")], {})).toBeNull();
  });

  it("flags an available runtime update", () => {
    expect(runtimesWarningOf([runtime("sd-cpp", "1.0")], { "sd-cpp": update(true) })).toBe(
      "A runtime update is available",
    );
  });

  it("gives the missing runtimes before an update", () => {
    expect(runtimesWarningOf([runtime("geniex", null)], { geniex: update(true) })).toBe(
      "No runtime installed",
    );
  });

  it("flags nothing before the list is read", () => {
    expect(runtimesWarningOf(null, {})).toBeNull();
  });
});
