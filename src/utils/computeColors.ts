import type { ComputeTarget } from "../types";

/** Colour per compute target, shared by the usage graph and the benchmark charts. */
export const COMPUTE_COLOR: Record<ComputeTarget, string> = {
  cpu: "#36afd8",
  gpu: "#e8833a",
  npu: "#b552c5",
};
