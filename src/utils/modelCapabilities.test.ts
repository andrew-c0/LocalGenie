import { describe, expect, it } from "vitest";
import type { CapabilityEntry, ModelCapabilities } from "../types";
import { capabilityMap } from "./capabilityStatus";
import {
  capabilityBadges,
  capabilityRows,
  hintLabel,
  settingWarnings,
  thinkingNote,
} from "./modelCapabilities";

const llamaCaps: ModelCapabilities = {
  engine: "llama_cpp",
  contextLength: 262144,
  architecture: "qwen35",
  quantisation: "Q8_K_XL",
  hasVisionProjector: false,
  hasAudioEncoder: null,
  thinkingHint: true,
  toolCallHint: true,
};

describe("settingWarnings for QAIRT", () => {
  it("warns when a context window is saved, since the bundle fixes it", () => {
    const warnings = settingWarnings("qairt", { nctx: 8192 });
    expect(warnings.nctx).toBe(
      "Ignored: context length is fixed when the QAIRT bundle is compiled.",
    );
  });

  it("does not warn for a setting that is not saved", () => {
    expect(settingWarnings("qairt", {})).toEqual({});
  });

  it("does not warn for the default GPU layers value", () => {
    expect(settingWarnings("qairt", { ngl: -1 })).toEqual({});
    expect(settingWarnings("qairt", { ngl: 20 })).toHaveProperty("ngl");
  });

  it("warns on the llama.cpp-only load and speculation settings", () => {
    const warnings = settingWarnings("qairt", {
      compute: "gpu",
      specType: "ngram-simple",
      specDraftModel: "org/draft:Q4",
    });
    expect(Object.keys(warnings).sort()).toEqual(["compute", "draftModel", "spec"]);
    expect(warnings.spec).toMatch(/llama\.cpp/);
  });
});

describe("settingWarnings for llama.cpp", () => {
  it("does not warn about a context window above the model's native length", () => {
    // The GenieX docs say the window is raised up to the trained maximum; this is not checked live.
    expect(settingWarnings("llama_cpp", { nctx: 999999 })).toEqual({});
  });

  it("warns when a draft-* type has no draft model", () => {
    expect(settingWarnings("llama_cpp", { specType: "draft-mtp" }).draftModel).toMatch(
      /No draft model/,
    );
  });

  it("does not warn when the draft model is set or the type needs none", () => {
    expect(
      settingWarnings("llama_cpp", { specType: "draft-mtp", specDraftModel: "org/d:Q4" }),
    ).toEqual({});
    expect(settingWarnings("llama_cpp", { specType: "ngram-simple" })).toEqual({});
  });
});

describe("hint labels and captions", () => {
  it("labels hints as likely, never as facts", () => {
    expect(hintLabel(true)).toBe("Likely");
    expect(hintLabel(false)).toBe("Likely not");
    expect(hintLabel(null)).toBe("Unknown");
  });

  it("adds a thinking caption only when the template shows no thinking markers", () => {
    expect(thinkingNote({ ...llamaCaps, thinkingHint: false })).toMatch(/may not think/);
    expect(thinkingNote({ ...llamaCaps, thinkingHint: true })).toBeUndefined();
    expect(thinkingNote({ ...llamaCaps, thinkingHint: null })).toBeUndefined();
    expect(thinkingNote(null)).toBeUndefined();
  });
});

describe("capabilityRows", () => {
  it("lists the file facts first, then the four scanned facts in order", () => {
    expect(capabilityRows(llamaCaps).map((r) => r.label)).toEqual([
      "Engine",
      "Architecture",
      "Context length",
      "Quantisation",
      "Thinking",
      "Tool calls",
      "Vision",
      "Audio",
    ]);
  });

  it("formats known file values", () => {
    const rows = Object.fromEntries(capabilityRows(llamaCaps).map((r) => [r.label, r.value]));
    expect(rows.Engine).toBe("llama.cpp (GGUF)");
    expect(rows.Architecture).toBe("qwen35");
    expect(rows["Context length"]).toBe("262,144 tokens");
    expect(rows.Quantisation).toBe("Q8_K_XL");
  });

  it("shows Unknown for file facts the model does not say", () => {
    const rows = Object.fromEntries(
      capabilityRows({ ...llamaCaps, architecture: null, quantisation: null }).map((r) => [
        r.label,
        r.value,
      ]),
    );
    expect(rows.Architecture).toBe("Unknown");
    expect(rows.Quantisation).toBe("Unknown");
  });

  it("shows Not tested for all scanned rows until a scan confirms them", () => {
    const rows = Object.fromEntries(capabilityRows(llamaCaps).map((r) => [r.label, r.value]));
    expect(rows.Thinking).toBe("Not tested");
    expect(rows["Tool calls"]).toBe("Not tested");
    expect(rows.Vision).toBe("Not tested");
    expect(rows.Audio).toBe("Not tested");
  });

  it("reads Vision and Audio from the scan, not from the file's projector flags", () => {
    const rows = capabilityRows({ ...llamaCaps, hasVisionProjector: true, hasAudioEncoder: true });
    expect(rows.find((r) => r.label === "Vision")?.value).toBe("Not tested");
    expect(rows.find((r) => r.label === "Audio")?.value).toBe("Not tested");
  });

  it("maps a fresh scan result to Works or Not supported", () => {
    const entry = (status: "works" | "accepted" | "rejected", stale = false) => ({
      key: "thinking" as const,
      status,
      detail: null,
      probedAt: 0,
      stale,
    });
    const rowFor = (scan: Parameters<typeof capabilityRows>[1]) =>
      capabilityRows(llamaCaps, scan).find((r) => r.label === "Thinking")?.value;
    expect(rowFor({ thinking: entry("works") })).toBe("Supported");
    expect(rowFor({ thinking: entry("accepted") })).toBe("Not supported");
    expect(rowFor({ thinking: entry("rejected") })).toBe("Not supported");
  });

  it("shows Not tested for a stale scan result, whatever its status", () => {
    const entry = (status: "works" | "accepted" | "rejected") => ({
      key: "toolCalls" as const,
      status,
      detail: null,
      probedAt: 0,
      stale: true,
    });
    const rowFor = (scan: Parameters<typeof capabilityRows>[1]) =>
      capabilityRows(llamaCaps, scan).find((r) => r.label === "Tool calls")?.value;
    expect(rowFor({ toolCalls: entry("works") })).toBe("Not tested");
    expect(rowFor({ toolCalls: entry("accepted") })).toBe("Not tested");
    expect(rowFor({ toolCalls: entry("rejected") })).toBe("Not tested");
  });

  it("attaches a scan key to the four scanned rows only", () => {
    const rows = capabilityRows(llamaCaps);
    expect(rows.find((r) => r.label === "Thinking")?.scanKey).toBe("thinking");
    expect(rows.find((r) => r.label === "Tool calls")?.scanKey).toBe("toolCalls");
    expect(rows.find((r) => r.label === "Vision")?.scanKey).toBe("vision");
    expect(rows.find((r) => r.label === "Audio")?.scanKey).toBe("audio");
    expect(rows.filter((r) => r.scanKey != null)).toHaveLength(4);
  });

  it("maps a fresh vision or audio scan result to Works or Not supported", () => {
    const entry = (key: "vision" | "audio", status: "works" | "accepted" | "rejected") => ({
      key,
      status,
      detail: null,
      probedAt: 0,
      stale: false,
    });
    const rowValue = (label: string, scan: Parameters<typeof capabilityRows>[1]) =>
      capabilityRows(llamaCaps, scan).find((r) => r.label === label)?.value;
    expect(rowValue("Vision", { vision: entry("vision", "works") })).toBe("Supported");
    expect(rowValue("Vision", { vision: entry("vision", "rejected") })).toBe("Not supported");
    expect(rowValue("Audio", { audio: entry("audio", "works") })).toBe("Supported");
    expect(rowValue("Audio", { audio: entry("audio", "accepted") })).toBe("Not supported");
  });

  it("shows QAIRT bundles without GGUF fields as unknown", () => {
    const rows = capabilityRows({
      ...llamaCaps,
      engine: "qairt",
      contextLength: null,
      architecture: null,
      quantisation: null,
      thinkingHint: null,
      toolCallHint: null,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Engine).toBe("QAIRT (AI Hub bundle)");
    expect(byLabel["Context length"]).toBe("Unknown");
    expect(byLabel.Architecture).toBe("Unknown");
  });
});

describe("capabilityBadges", () => {
  const scanEntry = (
    key: CapabilityEntry["key"],
    overrides: Partial<CapabilityEntry> = {},
  ): CapabilityEntry => ({
    key,
    status: "works",
    detail: null,
    probedAt: 1,
    stale: false,
    ...overrides,
  });

  /** Scan results indexed by setting, as the hook passes them. */
  const scanOf = (...entries: CapabilityEntry[]) => capabilityMap(entries);

  const ids = (...entries: CapabilityEntry[]) =>
    capabilityBadges(scanOf(...entries)).map((b) => b.id);

  it("shows tools and thinking when the scan works and is fresh", () => {
    expect(ids(scanEntry("toolCalls"), scanEntry("thinking"))).toEqual(["tools", "thinking"]);
  });

  it("uses the confirmed tooltip text as the label", () => {
    expect(capabilityBadges(scanOf(scanEntry("toolCalls"), scanEntry("thinking")))).toEqual([
      { id: "tools", label: "Tools: this model can use dedicated tools." },
      { id: "thinking", label: "Thinking: this model is capable of reasoning." },
    ]);
  });

  it("shows vision and audio when the scan works and is fresh", () => {
    expect(ids(scanEntry("vision"))).toEqual(["vision"]);
    expect(ids(scanEntry("audio"))).toEqual(["audio"]);
    expect(capabilityBadges(scanOf(scanEntry("vision")))).toEqual([
      { id: "vision", label: "Vision: this model can process images." },
    ]);
    expect(capabilityBadges(scanOf(scanEntry("audio")))).toEqual([
      { id: "audio", label: "Audio: this model can process audio files." },
    ]);
  });

  it("does not show a works result that is stale", () => {
    expect(
      ids(
        scanEntry("toolCalls", { stale: true }),
        scanEntry("thinking", { stale: true }),
        scanEntry("vision", { stale: true }),
        scanEntry("audio", { stale: true }),
      ),
    ).toEqual([]);
  });

  it("shows nothing for rejected, accepted or not tested results", () => {
    expect(ids(scanEntry("toolCalls", { status: "rejected" }))).toEqual([]);
    expect(ids(scanEntry("thinking", { status: "accepted" }))).toEqual([]);
    expect(ids(scanEntry("vision", { status: "rejected" }))).toEqual([]);
    expect(ids(scanEntry("audio", { status: "accepted" }))).toEqual([]);
    expect(ids()).toEqual([]);
    expect(capabilityBadges({})).toEqual([]);
  });

  it("returns tools, thinking, vision, audio in that order when all are confirmed", () => {
    const result = ids(
      scanEntry("audio"),
      scanEntry("vision"),
      scanEntry("thinking"),
      scanEntry("toolCalls"),
    );
    expect(result).toEqual(["tools", "thinking", "vision", "audio"]);
  });
});
