import { useEffect, useState } from "react";
import { type AihubCatalogEntry, aihubListModels } from "../../../services/aihub";
import { errorMessage } from "../../../utils/errorMessage";

/** Catalog list for the Qualcomm AI Hub tab. `entries` is null while loading. */
export function useAihubCatalog(): { entries: AihubCatalogEntry[] | null; error: string | null } {
  const [entries, setEntries] = useState<AihubCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    aihubListModels()
      .then((list) => {
        if (active) setEntries(list);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, "Could not load the Qualcomm AI Hub catalog."));
      });
    return () => {
      active = false;
    };
  }, []);

  return { entries, error };
}
