import { describe, expect, it } from "vitest";
import { lockedReason } from "./runtimeGuards";

describe("lockedReason", () => {
  it("opens everything until the state is read", () => {
    const unknown = { cliInstalled: null, runtimeIds: null };
    expect(lockedReason("cli", unknown)).toBeNull();
    expect(lockedReason("sd-cpp", unknown)).toBeNull();
  });

  it("locks the CLI areas when the CLI is missing", () => {
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
