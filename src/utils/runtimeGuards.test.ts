import { describe, expect, it } from "vitest";
import { cliActionReason, lockedReason } from "./runtimeGuards";

describe("lockedReason", () => {
  it("opens everything until the state is read", () => {
    const unknown = { cliInstalled: null, runtimeIds: null };
    expect(lockedReason("cli", unknown)).toBeNull();
    expect(lockedReason("sd-cpp", unknown)).toBeNull();
  });

  it("locks an area that needs the CLI when the CLI is missing", () => {
    const reason = lockedReason("cli", { cliInstalled: false, runtimeIds: [] });
    expect(reason).toContain("Settings > Runtimes");
    expect(reason).toContain("GenieX");
  });

  it("locks an optional runtime only when it is not installed", () => {
    const installed = { cliInstalled: true, runtimeIds: ["sd-cpp"] };
    expect(lockedReason("sd-cpp", installed)).toBeNull();
    expect(lockedReason("sherpa-onnx", installed)).toContain("sherpa-onnx");
  });
});

describe("cliActionReason", () => {
  it("allows the action until the CLI state is read", () => {
    expect(cliActionReason(null)).toBeNull();
  });

  it("allows the action when the CLI is installed", () => {
    expect(cliActionReason(true)).toBeNull();
  });

  it("gives the locked-area text when the CLI is missing, so every action says the same thing", () => {
    expect(cliActionReason(false)).toBe("Needs the GenieX CLI. Install it in Settings > Runtimes.");
    expect(cliActionReason(false)).toBe(
      lockedReason("cli", { cliInstalled: false, runtimeIds: [] }),
    );
  });
});
