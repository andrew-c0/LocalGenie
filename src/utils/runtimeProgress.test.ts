import { describe, expect, it } from "vitest";
import { runtimeStageLabel } from "./runtimeProgress";

describe("runtimeStageLabel", () => {
  it("names each install stage", () => {
    expect(runtimeStageLabel("checking")).toBe("Checking release");
    expect(runtimeStageLabel("downloading")).toBe("Downloading");
    expect(runtimeStageLabel("verifying")).toBe("Verifying");
    expect(runtimeStageLabel("extracting")).toBe("Extracting");
    expect(runtimeStageLabel("installing")).toBe("Installing…");
    expect(runtimeStageLabel("done")).toBe("Done");
    expect(runtimeStageLabel("error")).toBe("Failed");
  });
});
