import { describe, expect, it } from "vitest";
import { settingsButtons } from "./settingsButtons";

describe("settingsButtons", () => {
  it("offers Save and Scan when the selected model is the loaded one", () => {
    const buttons = settingsButtons({
      loadedModel: "Qwen3.5-0.8B-GGUF",
      selectedModel: "Qwen3.5-0.8B-GGUF",
      scanning: false,
    });
    expect(buttons).toEqual([
      { action: "save", label: "Save", appearance: "primary" },
      { action: "scan", label: "Scan", appearance: "secondary" },
    ]);
  });

  it("matches the loaded model by base name, ignoring the precision", () => {
    const buttons = settingsButtons({
      loadedModel: "Qwen3.5-0.8B-GGUF:Q8_K_XL",
      selectedModel: "Qwen3.5-0.8B-GGUF",
      scanning: false,
    });
    expect(buttons.map((b) => b.action)).toEqual(["save", "scan"]);
  });

  it("offers Save and Reload & Scan, and no Save & Load, when a different model is loaded", () => {
    const buttons = settingsButtons({
      loadedModel: "gemma-4-E4B-it-GGUF",
      selectedModel: "Qwen3.5-0.8B-GGUF",
      scanning: false,
    });
    expect(buttons.map((b) => b.action)).toEqual(["save", "reloadAndScan"]);
    expect(buttons.map((b) => b.label)).toEqual(["Save", "Reload & Scan"]);
  });

  it("offers Save, Save & Load and Reload & Scan when nothing is loaded", () => {
    const buttons = settingsButtons({
      loadedModel: null,
      selectedModel: "Qwen3.5-0.8B-GGUF",
      scanning: false,
    });
    expect(buttons.map((b) => b.action)).toEqual(["save", "saveAndLoad", "reloadAndScan"]);
    expect(buttons.map((b) => b.label)).toEqual(["Save", "Save & Load", "Reload & Scan"]);
  });

  it("replaces the buttons with Cancel scan while a scan runs, whatever is loaded", () => {
    const states = [
      { loadedModel: "Qwen3.5-0.8B-GGUF", selectedModel: "Qwen3.5-0.8B-GGUF" },
      { loadedModel: "gemma-4-E4B-it-GGUF", selectedModel: "Qwen3.5-0.8B-GGUF" },
      { loadedModel: null, selectedModel: "Qwen3.5-0.8B-GGUF" },
    ];
    for (const state of states) {
      expect(settingsButtons({ ...state, scanning: true })).toEqual([
        { action: "cancelScan", label: "Cancel scan", appearance: "secondary" },
      ]);
    }
  });
});
