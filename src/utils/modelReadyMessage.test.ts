import { describe, expect, it } from "vitest";
import { modelReadyMessage } from "./modelReadyMessage";

describe("modelReadyMessage", () => {
  it("names the model and says it can be loaded", () => {
    expect(modelReadyMessage("org/model", false)).toBe(
      "org/model is imported and available to load.",
    );
  });

  it("adds the scan hint when asked", () => {
    const text = modelReadyMessage("org/model", true);
    expect(text.startsWith("org/model is imported and available to load.")).toBe(true);
    expect(text).toContain("Reload & Scan");
    expect(text).toContain("model selector");
  });
});
