import { describe, expect, it } from "vitest";
import type { OcrComputeSettings, PlaygroundDevice } from "../types";
import { DEVICE_AUTO } from "./playground";
import {
  computeRowsOf,
  cpuOnlyRow,
  imageComputeRow,
  imageDeviceForRunOn,
  ocrComputeRows,
  type RunOnOption,
  runOnValueOf,
} from "./playgroundCompute";

const device = (overrides: Partial<PlaygroundDevice> = {}): PlaygroundDevice => ({
  name: "GPU0",
  description: "Qualcomm Adreno X1-85",
  kind: "gpu",
  ...overrides,
});

const CPU = device({ name: "CPU0", description: "Snapdragon X Elite", kind: "cpu" });
const NPU = device({ name: "NPU0", description: "Hexagon", kind: "npu" });
const GPU = device({ name: "GPU0", kind: "gpu" });

/** The enabled flag of each option, by value. */
function enabledOf(options: RunOnOption[]): Record<string, boolean> {
  return Object.fromEntries(options.map((option) => [option.value, option.enabled]));
}

const OCR_SETTINGS: OcrComputeSettings = { compute: "cpu", visionCompute: "npu" };

describe("imageComputeRow", () => {
  it("offers only the kinds the build lists, and Auto", () => {
    const row = imageComputeRow([CPU, NPU], DEVICE_AUTO);
    expect(enabledOf(row.options)).toEqual({ auto: true, npu: true, gpu: false, cpu: true });
  });

  it("disables every option until the devices are read", () => {
    const row = imageComputeRow(null, DEVICE_AUTO);
    expect(row.options.every((option) => !option.enabled)).toBe(true);
    expect(row.hint).toBeNull();
  });

  it("labels Auto with the CPU when the build lists one", () => {
    expect(imageComputeRow([CPU], DEVICE_AUTO).options[0]?.label).toBe("Auto (CPU)");
    expect(imageComputeRow([GPU], DEVICE_AUTO).options[0]?.label).toBe("Auto");
    expect(imageComputeRow(null, DEVICE_AUTO).options[0]?.label).toBe("Auto");
  });

  it("selects the kind of the chosen device, and Auto for auto", () => {
    expect(imageComputeRow([CPU, GPU], "GPU0").value).toBe("gpu");
    expect(imageComputeRow([CPU, GPU], DEVICE_AUTO).value).toBe("auto");
  });

  it("warns that a selected GPU is experimental", () => {
    expect(imageComputeRow([CPU, GPU], "GPU0").hint).toBe(
      "Experimental: may be slower than the CPU.",
    );
  });

  it("says so when the build lists only the CPU", () => {
    expect(imageComputeRow([CPU], DEVICE_AUTO).hint).toBe("This build only supports the CPU.");
  });

  it("writes to the image device", () => {
    expect(imageComputeRow([CPU], DEVICE_AUTO).setting).toBe("device");
  });
});

describe("runOnValueOf", () => {
  it("gives the kind of a listed device", () => {
    expect(runOnValueOf("NPU0", [CPU, NPU])).toBe("npu");
  });

  it("gives auto for auto, an unlisted device and an other-kind device", () => {
    expect(runOnValueOf(DEVICE_AUTO, [CPU])).toBe("auto");
    expect(runOnValueOf("GPU9", [CPU])).toBe("auto");
    expect(runOnValueOf("X", [device({ name: "X", kind: "other" })])).toBe("auto");
  });
});

describe("imageDeviceForRunOn", () => {
  it("writes the first listed device of the chosen kind", () => {
    expect(imageDeviceForRunOn("npu", [CPU, NPU])).toBe("NPU0");
  });

  it("writes auto for auto, and for a kind the build does not list", () => {
    expect(imageDeviceForRunOn("auto", [CPU, NPU])).toBe(DEVICE_AUTO);
    expect(imageDeviceForRunOn("gpu", [CPU, NPU])).toBe(DEVICE_AUTO);
  });

  it("round-trips with runOnValueOf", () => {
    const devices = [CPU, NPU, GPU];
    for (const value of ["npu", "gpu", "cpu"] as const) {
      expect(runOnValueOf(imageDeviceForRunOn(value, devices), devices)).toBe(value);
    }
  });
});

describe("cpuOnlyRow", () => {
  it("enables only the CPU, and has no setting to write", () => {
    const row = cpuOnlyRow("Speech runs on the CPU only.");
    expect(enabledOf(row.options)).toEqual({ auto: false, npu: false, gpu: false, cpu: true });
    expect(row.value).toBe("cpu");
    expect(row.setting).toBeNull();
    expect(row.hint).toBe("Speech runs on the CPU only.");
  });
});

describe("ocrComputeRows", () => {
  it("gives a language model row with every choice, and a vision encoder row with NPU and CPU only", () => {
    const [language, vision] = ocrComputeRows(OCR_SETTINGS);
    expect(language?.label).toBe("Language model");
    expect(language?.setting).toBe("ocrCompute");
    expect(enabledOf(language?.options ?? [])).toEqual({
      auto: true,
      npu: true,
      gpu: true,
      cpu: true,
    });
    expect(vision?.label).toBe("Vision encoder");
    expect(vision?.setting).toBe("ocrVision");
    expect(enabledOf(vision?.options ?? [])).toEqual({
      auto: false,
      npu: true,
      gpu: false,
      cpu: true,
    });
  });

  it("shows the saved choice of each row", () => {
    const [language, vision] = ocrComputeRows({ compute: "gpu", visionCompute: "cpu" });
    expect(language?.value).toBe("gpu");
    expect(vision?.value).toBe("cpu");
  });
});

describe("computeRowsOf", () => {
  const state = { devices: [CPU, NPU], device: DEVICE_AUTO, ocr: OCR_SETTINGS };

  it("gives the image tools the device row", () => {
    expect(computeRowsOf("playground-text-to-image", state)).toEqual([
      imageComputeRow([CPU, NPU], DEVICE_AUTO),
    ]);
    expect(computeRowsOf("playground-image-to-image", state)).toHaveLength(1);
  });

  it("gives OCR its two rows", () => {
    expect(computeRowsOf("playground-ocr", state)).toHaveLength(2);
  });

  it("gives the CPU-only tools a fixed CPU row", () => {
    for (const toolId of [
      "playground-image-upscaling",
      "playground-speech-to-text",
      "playground-text-to-speech",
      "playground-audio-to-audio",
    ] as const) {
      const rows = computeRowsOf(toolId, state);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.setting).toBeNull();
      expect(rows[0]?.value).toBe("cpu");
    }
  });

  it("gives the landing no rows, since no tool is chosen", () => {
    expect(computeRowsOf(null, state)).toEqual([]);
  });
});
