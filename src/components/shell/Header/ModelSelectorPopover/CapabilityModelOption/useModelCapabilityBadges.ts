import { useEffect, useState } from "react";
import { loadModelCapabilities } from "../../../../../services/models";
import { capabilityMap } from "../../../../../utils/capabilityStatus";
import { type CapabilityBadge, capabilityBadges } from "../../../../../utils/modelCapabilities";

/**
 * Confirmed capability badges for one model, from its stored scan results. The scan loads once per
 * mount. A failed load counts as unconfirmed. Until the result for this model arrives, the list is
 * empty.
 */
export function useModelCapabilityBadges(modelName: string): CapabilityBadge[] {
  const [loaded, setLoaded] = useState<{ model: string; badges: CapabilityBadge[] } | null>(null);

  useEffect(() => {
    let current = true;
    loadModelCapabilities(modelName)
      .catch(() => [])
      .then((entries) => {
        if (!current) return;
        setLoaded({ model: modelName, badges: capabilityBadges(capabilityMap(entries)) });
      });
    return () => {
      current = false;
    };
  }, [modelName]);

  // Derived: a result for another model is never shown for this one.
  return loaded?.model === modelName ? loaded.badges : [];
}
