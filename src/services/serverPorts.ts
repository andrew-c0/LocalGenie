import type { ComputeTarget } from "../types";
import {
  COMPUTE_PORT_KEYS,
  type ComputePorts,
  isValidPort,
  PORT_FREE,
  type PortUse,
  portUseOf,
} from "../utils/serverPorts";
import {
  type SaveOutcome,
  type SettingWrite,
  writeAllOrRollBack,
} from "../utils/writeAllOrRollBack";
import * as db from "./database";
import * as geniex from "./geniex";

/** Saved port for one compute. Null when none is set or the stored value is not a valid port. */
async function readComputePort(compute: ComputeTarget): Promise<number | null> {
  const port = await db.getPreference<number>(COMPUTE_PORT_KEYS[compute]).catch(() => null);
  return port !== null && isValidPort(port) ? port : null;
}

/** Saved ports of all computes. A compute with no port set is null, which means a random port. */
export async function getComputePorts(): Promise<ComputePorts> {
  const [cpu, gpu, npu] = await Promise.all([
    readComputePort("cpu"),
    readComputePort("gpu"),
    readComputePort("npu"),
  ]);
  return { cpu, gpu, npu };
}

/**
 * Writes the port settings in order. If one write fails, the ones already written are restored, so
 * the stored ports are not left half-applied. A null value is stored as unset.
 */
export function saveServerPorts(writes: SettingWrite[]): Promise<SaveOutcome> {
  return writeAllOrRollBack(writes, (key, value) => db.setPreference(key, value, "number"));
}

/**
 * What holds `port` for a field of `target` (null for the main port). Reads this app's servers and
 * probes the port. Never rejects: a failed read counts as "nothing answers", and an aborted probe
 * reports the port free (the caller ignores results it no longer wants).
 */
export async function probePortUse(
  port: number,
  target: ComputeTarget | null,
  signal?: AbortSignal,
): Promise<PortUse> {
  const [servers, answering] = await Promise.all([
    geniex.listServers().catch(() => []),
    geniex.isPortServing(port, signal).catch(() => false),
  ]);
  return signal?.aborted ? PORT_FREE : portUseOf(port, target, servers, answering);
}

/**
 * The port a compute's server should listen on: the saved port when one is set, otherwise a free
 * port picked by the OS. A random port is not saved here.
 */
export async function serverPortForCompute(compute: ComputeTarget): Promise<number> {
  const saved = await readComputePort(compute);
  if (saved !== null) return saved;
  return geniex.freePort();
}
