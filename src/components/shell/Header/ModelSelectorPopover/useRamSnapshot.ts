import { useEffect, useState } from "react";
import { loadModelRamEstimates } from "../../../../services/modelRam";
import { getRamHeadroomPercent } from "../../../../services/ramHeadroom";
import { getSystemMemory } from "../../../../services/system";
import type { RamSnapshot } from "../../../../utils/modelRam";

/**
 * The RAM figures the model selector shows: free and total memory, the headroom setting and each
 * model's estimate. Read each time the popover opens, not on a timer. Null until the read finishes,
 * and stays null when it fails, so the rows show no RAM line.
 */
export function useRamSnapshot(open: boolean, modelNames: string[]): RamSnapshot | null {
  const [snapshot, setSnapshot] = useState<RamSnapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setSnapshot(null);
    Promise.all([getSystemMemory(), getRamHeadroomPercent(), loadModelRamEstimates(modelNames)])
      .then(([memory, headroomPercent, rowsByModel]) => {
        if (current) setSnapshot({ memory, headroomPercent, rowsByModel });
      })
      .catch((err: unknown) => console.warn("[models] RAM estimates unavailable:", err));
    return () => {
      current = false;
    };
  }, [open, modelNames]);

  return snapshot;
}
