import { useEffect, useState } from "react";
import { getRamHeadroomPercent } from "../../../../services/ramHeadroom";
import { getSystemMemory } from "../../../../services/system";
import { useRamEstimateStore } from "../../../../stores/ramEstimateStore";
import type { RamSnapshot } from "../../../../utils/modelRam";

/**
 * The RAM figures the model selector shows: free and total memory and the headroom setting, read each
 * time the popover opens, plus each model's stored RAM. The stored figures are kept in `ramEstimateStore`
 * (read when the model list or a context setting changes), so opening the popover does not read the
 * model files again. Null until the read finishes, and stays null when it fails, so the rows show no
 * RAM line.
 */
export function useRamSnapshot(open: boolean): RamSnapshot | null {
  const ramByModel = useRamEstimateStore((s) => s.ramByModel);
  const [live, setLive] = useState<Pick<RamSnapshot, "memory" | "headroomPercent"> | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLive(null);
    Promise.all([getSystemMemory(), getRamHeadroomPercent()])
      .then(([memory, headroomPercent]) => {
        if (current) setLive({ memory, headroomPercent });
      })
      .catch((err: unknown) => console.warn("[models] memory figures unavailable:", err));
    return () => {
      current = false;
    };
  }, [open]);

  return live ? { ...live, ramByModel } : null;
}
