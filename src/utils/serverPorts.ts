import type { ComputeTarget, ServerStatus, ServerStoppedEvent } from "../types";
import type { SettingWrite } from "./writeAllOrRollBack";

/** Ports a GenieX server may use. */
export const PORT_VALID_RANGE = { min: 1024, max: 65535 } as const;

export const PORT_RANGE_MESSAGE = `Port must be ${PORT_VALID_RANGE.min}–${PORT_VALID_RANGE.max}`;

/** The computes that can each have their own server port, in display order. */
export const COMPUTE_PORT_TARGETS: readonly ComputeTarget[] = ["cpu", "gpu", "npu"];

export const COMPUTE_PORT_LABELS: Record<ComputeTarget, string> = {
  cpu: "CPU",
  gpu: "GPU",
  npu: "NPU",
};

/** Preference key that stores each compute's server port. */
export const COMPUTE_PORT_KEYS: Record<ComputeTarget, string> = {
  cpu: "server_port_cpu",
  gpu: "server_port_gpu",
  npu: "server_port_npu",
};

/** Preference key that stores the main server port. */
export const MAIN_PORT_KEY = "server_port";

/** Saved compute ports. `null` means no port is set, so the app picks a random free one. */
export type ComputePorts = Record<ComputeTarget, number | null>;

/** The text typed into each compute's port field. Blank means no port is set. */
export type ComputePortDrafts = Record<ComputeTarget, string>;

/** Error message per compute whose port is not usable. Only the failing computes have a key. */
export type ComputePortErrors = Partial<Record<ComputeTarget, string>>;

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= PORT_VALID_RANGE.min && port <= PORT_VALID_RANGE.max;
}

/**
 * Reads a port field. Blank gives `null` (no port set). Anything else gives the number typed, which
 * may still be invalid (`NaN` for text); check it with `isValidPort`.
 */
export function parsePortDraft(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  return Number(text);
}

/** Port text for each compute, as typed in the fields. */
export function portsToDrafts(ports: ComputePorts): ComputePortDrafts {
  return {
    cpu: ports.cpu === null ? "" : String(ports.cpu),
    gpu: ports.gpu === null ? "" : String(ports.gpu),
    npu: ports.npu === null ? "" : String(ports.npu),
  };
}

/** Ports to save for the typed fields. Only call this once `validateComputePorts` reports no errors. */
export function draftsToPorts(drafts: ComputePortDrafts): ComputePorts {
  return {
    cpu: parsePortDraft(drafts.cpu),
    gpu: parsePortDraft(drafts.gpu),
    npu: parsePortDraft(drafts.npu),
  };
}

/** The compute whose port is `port`, or null when none uses it. Blank fields never match. */
export function computeUsingPort(
  drafts: ComputePortDrafts,
  port: number | null,
): ComputeTarget | null {
  if (port === null) return null;
  return COMPUTE_PORT_TARGETS.find((target) => parsePortDraft(drafts[target]) === port) ?? null;
}

/**
 * Errors for the compute port fields. A blank field is fine (random port). A set port must be in
 * range, must not equal the main server port (`mainPort`, null when the main port is not valid),
 * and must not equal another compute's port. A duplicate is reported on both fields.
 */
export function validateComputePorts(
  drafts: ComputePortDrafts,
  mainPort: number | null,
): ComputePortErrors {
  const errors: ComputePortErrors = {};
  for (const target of COMPUTE_PORT_TARGETS) {
    const port = parsePortDraft(drafts[target]);
    if (port === null) continue;
    if (!isValidPort(port)) {
      errors[target] = PORT_RANGE_MESSAGE;
      continue;
    }
    if (port === mainPort) {
      errors[target] = "Same as the main server port";
      continue;
    }
    const duplicate = COMPUTE_PORT_TARGETS.find(
      (other) => other !== target && parsePortDraft(drafts[other]) === port,
    );
    if (duplicate) {
      errors[target] = `Same port as the ${COMPUTE_PORT_LABELS[duplicate]} server`;
    }
  }
  return errors;
}

/** Message for a port that another program answers on. Shared by the main and the compute fields. */
export function portInUseMessage(port: number): string {
  return `Port ${port} is already in use by another process`;
}

/**
 * What holds a port, as seen from one field. `free` covers a port nothing answers on, and a port
 * this app's server for the same compute runs on (that server is the field's own, not a conflict).
 * `other-server` is this app's server for a different compute. `other-process` is anything else.
 */
export type PortUse =
  | { kind: "free" }
  | { kind: "other-process" }
  | { kind: "other-server"; compute: ComputeTarget };

export const PORT_FREE: PortUse = { kind: "free" };

/** The compute a server reports, or null when it is unknown or not one of the three computes. */
export function computeOfServer(compute: string | null | undefined): ComputeTarget | null {
  return COMPUTE_PORT_TARGETS.find((target) => target === compute) ?? null;
}

/**
 * The use of `port` for a field of `target` (null for the main port). `servers` are this app's
 * servers and `answering` says whether anything answers on the port. A running server of ours
 * decides it when its compute is known: its own compute is free, another compute is a conflict. An
 * unknown compute falls back to whether the port answers.
 */
export function portUseOf(
  port: number,
  target: ComputeTarget | null,
  servers: ServerStatus[],
  answering: boolean,
): PortUse {
  const owner = servers.find((server) => server.running && server.port === port);
  const ownerCompute = owner ? computeOfServer(owner.compute) : null;
  if (ownerCompute !== null) {
    return ownerCompute === target ? PORT_FREE : { kind: "other-server", compute: ownerCompute };
  }
  return answering ? { kind: "other-process" } : PORT_FREE;
}

/** The message for a port in use, or undefined when the port is free for this field. */
export function portUseMessage(port: number, use: PortUse): string | undefined {
  switch (use.kind) {
    case "free":
      return undefined;
    case "other-process":
      return portInUseMessage(port);
    case "other-server":
      return `Port ${port} is already used by the ${COMPUTE_PORT_LABELS[use.compute]} server`;
  }
}

/**
 * Whether a `server-stopped` event concerns the main server. A payload of null or missing (older
 * emits) counts as the main server; otherwise only the main port does.
 */
export function stopAffectsMainServer(
  payload: ServerStoppedEvent | null | undefined,
  mainPort: number,
): boolean {
  if (payload === null || payload === undefined) return true;
  return payload.port === mainPort;
}

/**
 * The port to check for a field, or null when there is nothing new to check. A port is checked only
 * when it differs from the saved one (an unchanged port is the one the server already uses, so it is
 * not a conflict) and passed validation (`error` is the field's validation message, if any).
 */
export function portToProbe(
  port: number | null,
  saved: number | null,
  error: string | undefined,
): number | null {
  if (port === null || error !== undefined || port === saved) return null;
  return port;
}

/** `portToProbe` for each compute. */
export function portsToProbe(
  ports: ComputePorts,
  saved: ComputePorts,
  errors: ComputePortErrors,
): ComputePorts {
  return {
    cpu: portToProbe(ports.cpu, saved.cpu, errors.cpu),
    gpu: portToProbe(ports.gpu, saved.gpu, errors.gpu),
    npu: portToProbe(ports.npu, saved.npu, errors.npu),
  };
}

/**
 * Adds the in-use message to each compute whose port is taken for it (see `portUseMessage`). A field
 * that already has an error keeps its first error.
 */
export function addPortInUseErrors(
  errors: ComputePortErrors,
  ports: ComputePorts,
  uses: Record<ComputeTarget, PortUse>,
): ComputePortErrors {
  const merged: ComputePortErrors = { ...errors };
  for (const target of COMPUTE_PORT_TARGETS) {
    const port = ports[target];
    if (port === null || merged[target] !== undefined) continue;
    const message = portUseMessage(port, uses[target]);
    if (message !== undefined) merged[target] = message;
  }
  return merged;
}

/**
 * The stored settings a save changes, main port first, then each compute. A setting whose value does
 * not change is left out, so it is not written again.
 */
export function portSettingWrites(
  main: { previous: number; next: number },
  compute: { previous: ComputePorts; next: ComputePorts },
): SettingWrite[] {
  const writes: SettingWrite[] = [
    { key: MAIN_PORT_KEY, label: "server port", previous: main.previous, next: main.next },
    ...COMPUTE_PORT_TARGETS.map((target) => ({
      key: COMPUTE_PORT_KEYS[target],
      label: `${COMPUTE_PORT_LABELS[target]} port`,
      previous: compute.previous[target],
      next: compute.next[target],
    })),
  ];
  return writes.filter((write) => write.previous !== write.next);
}
