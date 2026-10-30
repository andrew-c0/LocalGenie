import { useCallback, useEffect, useState } from "react";
import { getComputePorts } from "../../../services/serverPorts";
import type { ComputeTarget } from "../../../types";
import {
  addPortInUseErrors,
  type ComputePortDrafts,
  type ComputePortErrors,
  type ComputePorts,
  computeUsingPort,
  draftsToPorts,
  portsToDrafts,
  portsToProbe,
  validateComputePorts,
} from "../../../utils/serverPorts";
import { usePortUse } from "./usePortUse";

const BLANK_DRAFTS: ComputePortDrafts = { cpu: "", gpu: "", npu: "" };
const NO_PORTS: ComputePorts = { cpu: null, gpu: null, npu: null };

/**
 * The per-compute server port fields. Loads the saved ports once, holds the typed text, and derives
 * the errors from it, including a port another program is using. `mainPort` is the main server port
 * as typed, or null when it is not valid. Call `markSaved` after the ports are written.
 */
export function useComputePortDrafts(mainPort: number | null) {
  const [drafts, setDrafts] = useState<ComputePortDrafts>(BLANK_DRAFTS);
  const [savedPorts, setSavedPorts] = useState<ComputePorts>(NO_PORTS);

  useEffect(() => {
    let active = true;
    getComputePorts()
      .then((ports) => {
        if (!active) return;
        setSavedPorts(ports);
        setDrafts(portsToDrafts(ports));
      })
      .catch((err) => console.error("Failed to load compute ports:", err));
    return () => {
      active = false;
    };
  }, []);

  const setDraft = useCallback((target: ComputeTarget, value: string) => {
    setDrafts((prev) => ({ ...prev, [target]: value }));
  }, []);

  const markSaved = useCallback((ports: ComputePorts) => setSavedPorts(ports), []);

  const draftPorts = draftsToPorts(drafts);
  const validationErrors = validateComputePorts(drafts, mainPort);
  const probe = portsToProbe(draftPorts, savedPorts, validationErrors);
  const cpuProbe = usePortUse(probe.cpu, "cpu");
  const gpuProbe = usePortUse(probe.gpu, "gpu");
  const npuProbe = usePortUse(probe.npu, "npu");

  const uses = { cpu: cpuProbe.use, gpu: gpuProbe.use, npu: npuProbe.use };
  const checking = { cpu: cpuProbe.checking, gpu: gpuProbe.checking, npu: npuProbe.checking };
  const errors: ComputePortErrors = addPortInUseErrors(validationErrors, draftPorts, uses);
  const mainClash = computeUsingPort(drafts, mainPort);

  return { drafts, setDraft, errors, checking, mainClash, draftPorts, savedPorts, markSaved };
}
