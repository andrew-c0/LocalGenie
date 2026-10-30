import { useEffect, useState } from "react";
import { resolveModelCompute } from "../../../../services/modelLoad";
import type { ResolvedComputes } from "../../../../utils/modelSelector";

/**
 * The compute each model would load on, read from its saved settings. Read each time the popover
 * opens and kept for that session, so each model is looked up once per open. A model whose lookup
 * fails has no entry.
 */
export function useResolvedComputes(open: boolean, modelNames: string[]): ResolvedComputes {
  const [resolved, setResolved] = useState<ResolvedComputes>({});

  useEffect(() => {
    if (!open) return;
    let current = true;
    setResolved({});
    Promise.all(
      modelNames.map(async (name) => ({
        name,
        compute: await resolveModelCompute(name).catch(() => null),
      })),
    ).then((entries) => {
      if (!current) return;
      const found: ResolvedComputes = {};
      for (const { name, compute } of entries) {
        if (compute !== null) found[name] = compute;
      }
      setResolved(found);
    });
    return () => {
      current = false;
    };
  }, [open, modelNames]);

  return resolved;
}
