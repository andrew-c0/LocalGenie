import type { ComputeTarget } from "../types";
import { COMPUTE_PORT_LABELS } from "./serverPorts";

/**
 * True when a reported device is the unit a compute asks for: NPU is an HTP device, CPU is a CPU, and
 * GPU is anything that is neither. Case-insensitive.
 */
export function deviceMatchesCompute(compute: ComputeTarget, device: string): boolean {
  const name = device.trim().toLowerCase();
  const isNpu = name.startsWith("htp");
  const isCpu = name.startsWith("cpu");
  switch (compute) {
    case "npu":
      return isNpu;
    case "cpu":
      return isCpu;
    case "gpu":
      return !isNpu && !isCpu;
  }
}

/**
 * Warning text when a load reports a different unit than the compute asked for, or null when it
 * matches. An unknown unit (null or blank) is not a mismatch.
 */
export function deviceMismatchMessage(
  compute: ComputeTarget,
  device: string | null,
): string | null {
  if (device === null || device.trim() === "") return null;
  if (deviceMatchesCompute(compute, device)) return null;
  return `Requested ${COMPUTE_PORT_LABELS[compute]} but the server runs on ${device}.`;
}
