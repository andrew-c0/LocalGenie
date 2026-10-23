import type {
  CapabilityEntry,
  CapabilityKey,
  ModelCapabilities,
  StoredModelSettings,
} from "../types";
import { DEFAULT_LOAD_SETTINGS, type ModelEngine, usesDraftModel } from "./modelSettings";

/** Settings that can show a warning next to their control. */
export type WarnedSetting = "nctx" | "ngl" | "compute" | "spec" | "draftModel";

export type SettingWarnings = Partial<Record<WarnedSetting, string>>;

const LLAMA_ONLY = "Ignored: this setting applies to llama.cpp (GGUF) models only.";

/**
 * Warnings for saved settings that the engine ignores, or that cannot work as saved. Only values
 * the user has set are checked, so defaults never warn. A setting the engine ignores is left out
 * of the chat request by `resolveLoadParams`, so the warning matches what is sent.
 */
export function settingWarnings(
  engine: ModelEngine,
  settings: StoredModelSettings,
): SettingWarnings {
  const warnings: SettingWarnings = {};
  if (engine === "qairt") {
    if (settings.nctx != null) {
      warnings.nctx = "Ignored: context length is fixed when the QAIRT bundle is compiled.";
    }
    if (settings.ngl != null && settings.ngl !== DEFAULT_LOAD_SETTINGS.ngl) {
      warnings.ngl = LLAMA_ONLY;
    }
    if (settings.compute) warnings.compute = LLAMA_ONLY;
    if (settings.specType) warnings.spec = LLAMA_ONLY;
    if (settings.specDraftModel) warnings.draftModel = LLAMA_ONLY;
    return warnings;
  }
  // The server never downloads a draft model, so a draft-* type without one fails on each request.
  if (usesDraftModel(settings.specType) && !settings.specDraftModel) {
    warnings.draftModel =
      "No draft model is set. The server does not download one, so requests fail until one is set.";
  }
  return warnings;
}

/** "Likely", "Likely not" or "Unknown" for a heuristic hint. */
export function hintLabel(hint: boolean | null): string {
  if (hint == null) return "Unknown";
  return hint ? "Likely" : "Likely not";
}

/** Caption under the Think Mode switch when the chat template shows no sign of thinking. */
export function thinkingNote(caps: ModelCapabilities | null): string | undefined {
  if (caps?.thinkingHint !== false) return undefined;
  return "This model's chat template shows no sign of thinking, so it may not think even with the switch on.";
}

const ENGINE_LABEL: Record<ModelCapabilities["engine"], string> = {
  llama_cpp: "llama.cpp (GGUF)",
  qairt: "QAIRT (AI Hub bundle)",
};

export interface CapabilityRow {
  label: string;
  value: string;
  /** Scan result that sets this row's value, when the scan tests this fact. */
  scanKey?: CapabilityKey;
}

/**
 * Value of a row the scan tests. A fresh "works" result reads "Works". A fresh "accepted" or
 * "rejected" result means the scan tested it and the model does not support it in practice, so
 * it reads "Not supported". No result, or a stale one, reads "Not tested".
 */
export function scanRowValue(entry: CapabilityEntry | undefined): string {
  if (!entry || entry.stale) return "Not tested";
  switch (entry.status) {
    case "works":
      return "Supported";
    case "accepted":
    case "rejected":
      return "Not supported";
  }
}

/**
 * Rows for the capability block, in display order. Unknown values read as "Unknown", never blank.
 * Rows with a `scanKey` show the scan result instead of the file's heuristic.
 */
export function capabilityRows(
  caps: ModelCapabilities,
  scan: Partial<Record<CapabilityKey, CapabilityEntry>> = {},
): CapabilityRow[] {
  return [
    { label: "Engine", value: ENGINE_LABEL[caps.engine] },
    { label: "Architecture", value: caps.architecture ?? "Unknown" },
    {
      label: "Context length",
      value:
        caps.contextLength != null
          ? `${caps.contextLength.toLocaleString("en-US")} tokens`
          : "Unknown",
    },
    { label: "Quantisation", value: caps.quantisation ?? "Unknown" },
    { label: "Thinking", value: scanRowValue(scan.thinking), scanKey: "thinking" },
    { label: "Tool calls", value: scanRowValue(scan.toolCalls), scanKey: "toolCalls" },
    { label: "Vision", value: scanRowValue(scan.vision), scanKey: "vision" },
    { label: "Audio", value: scanRowValue(scan.audio), scanKey: "audio" },
  ];
}

export type CapabilityBadgeId = "tools" | "thinking" | "vision" | "audio";

/** A confirmed capability shown as an icon. `label` is the tooltip and the accessible label. */
export interface CapabilityBadge {
  id: CapabilityBadgeId;
  label: string;
}

/** A scan setting is confirmed only by a current "works" result. */
function scanConfirmed(entry: CapabilityEntry | undefined): boolean {
  return entry !== undefined && !entry.stale && entry.status === "works";
}

/**
 * Confirmed capability badges for one model, in display order (tools, thinking, vision, audio).
 * `scan` is the stored scan results indexed by setting (see `capabilityMap`). Every badge comes
 * from the scan, never from the model file. Heuristic hints, stale, rejected, accepted and
 * untested results add no badge.
 */
export function capabilityBadges(
  scan: Partial<Record<CapabilityKey, CapabilityEntry>>,
): CapabilityBadge[] {
  const badges: CapabilityBadge[] = [];
  if (scanConfirmed(scan.toolCalls)) {
    badges.push({ id: "tools", label: "Tools: this model can use dedicated tools." });
  }
  if (scanConfirmed(scan.thinking)) {
    badges.push({ id: "thinking", label: "Thinking: this model is capable of reasoning." });
  }
  if (scanConfirmed(scan.vision)) {
    badges.push({ id: "vision", label: "Vision: this model can process images." });
  }
  if (scanConfirmed(scan.audio)) {
    badges.push({ id: "audio", label: "Audio: this model can process audio files." });
  }
  return badges;
}
