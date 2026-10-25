import { invoke } from "@tauri-apps/api/core";
import type {
  CapabilityEntry,
  CapabilityScanResult,
  ModelCapabilities,
  ModelLoadParams,
} from "../types";

/**
 * Bytes the KV cache reserves for `nCtx` tokens, computed from the model's GGUF header. Resolves to
 * null when the model has no GGUF weights or its header lacks the attention sizes.
 */
export async function getContextMemory(modelName: string, nCtx: number): Promise<number | null> {
  return invoke("get_context_memory", { modelName, nCtx });
}

/**
 * Capability summary for a downloaded model, read from its GGUF files in the GenieX cache.
 * Takes the model name (`org/repo`, an optional `:precision` is ignored). Rejects when the model
 * file cannot be read.
 */
export async function getModelCapabilities(modelName: string): Promise<ModelCapabilities> {
  return invoke("get_model_capabilities", { modelName });
}

/**
 * Stored settings-scan results for a model, marked stale when its file or GenieX changed since
 * they were taken. Takes the model name; any `:precision` suffix is ignored.
 */
export async function loadModelCapabilities(modelName: string): Promise<CapabilityEntry[]> {
  return invoke("load_model_capabilities", { model: modelName });
}

/**
 * Tests the sampling settings of a loaded model and saves the results. The model must already be
 * loaded; the scan does not load it. `load` is the model's load parameters, as chat sends them.
 * Rejects when the model is not loaded or a scan is already running.
 */
export async function scanModelCapabilities(
  modelName: string,
  load: ModelLoadParams | undefined,
  baseUrl: string,
): Promise<CapabilityScanResult> {
  return invoke("scan_model_capabilities", { model: modelName, load, baseUrl });
}

/** Asks the running scan to stop before its next setting. */
export async function cancelCapabilityScan(): Promise<void> {
  return invoke("cancel_capability_scan");
}
