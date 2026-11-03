import { useEffect, useState } from "react";
import { getRuntimeVersions } from "../../../services/geniex";
import { useModelStore } from "../../../stores/modelStore";
import type { RuntimeVersions } from "../../../types";
import { GENIEX_RUNTIME_ID } from "../../../utils/runtimeSpecifics";

/** One label and value on a runtime's card line, for example "QAIRT 2.x". */
export interface RuntimeDetail {
  label: string;
  value: string;
}

/**
 * The extra lines on each runtime's card, by runtime id. The GenieX CLI carries the llama.cpp and QAIRT
 * versions, so they are read while it is installed. Other runtimes have no extra lines.
 */
export function useRuntimeDetails(): Partial<Record<string, RuntimeDetail[]>> {
  const cliInstalled = useModelStore((s) => s.cliInstalled) === true;
  const [versions, setVersions] = useState<RuntimeVersions | null>(null);

  useEffect(() => {
    if (!cliInstalled) {
      setVersions(null);
      return;
    }
    getRuntimeVersions()
      .then(setVersions)
      .catch(() => setVersions(null));
  }, [cliInstalled]);

  if (!cliInstalled) return {};
  return {
    [GENIEX_RUNTIME_ID]: [
      { label: "llama.cpp", value: versions?.llamaCpp ?? "…" },
      { label: "QAIRT", value: versions?.qairt ?? "…" },
    ],
  };
}
