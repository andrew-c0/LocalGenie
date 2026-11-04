import { describe, expect, it } from "vitest";
import type { AppInfo } from "../types";
import { appSummary, NOT_INSTALLED, runtimeSources } from "./aboutInfo";

const INFO: AppInfo = {
  versions: { name: "LocalGenie", version: "0.1.0", tauriVersion: "2.5.0" },
  platform: { os: "Windows", osVersion: "Windows 11 Pro", arch: "aarch64", totalMemoryBytes: 1 },
};

describe("appSummary", () => {
  it("is null until the app info is read", () => {
    expect(appSummary(null, "production")).toBeNull();
  });

  it("joins the versions, the platform and the build mode", () => {
    expect(appSummary(INFO, "production")).toBe(
      "Version 0.1.0 · Tauri 2.5.0 · Windows 11 Pro (aarch64) · production build",
    );
  });

  it("falls back to the OS name when the OS version is empty", () => {
    const info: AppInfo = { ...INFO, platform: { ...INFO.platform, osVersion: "" } };
    expect(appSummary(info, "development")).toContain("Windows (aarch64)");
  });
});

describe("runtimeSources", () => {
  it("is empty before the list is read", () => {
    expect(runtimeSources(null)).toEqual([]);
  });

  it("gives the installed version, or Not installed, and the source page of each runtime", () => {
    expect(
      runtimeSources([
        {
          id: "geniex",
          displayName: "GenieX CLI",
          repo: "qualcomm/GenieX",
          installedVersion: "0.9.3",
        },
        {
          id: "sd-cpp",
          displayName: "stable-diffusion.cpp",
          repo: "andrew-c0/stable-diffusion.cpp",
          installedVersion: null,
        },
      ]),
    ).toEqual([
      {
        id: "geniex",
        name: "GenieX CLI",
        version: "0.9.3",
        url: "https://github.com/qualcomm/GenieX",
      },
      {
        id: "sd-cpp",
        name: "stable-diffusion.cpp",
        version: NOT_INSTALLED,
        url: "https://github.com/andrew-c0/stable-diffusion.cpp",
      },
    ]);
  });
});
