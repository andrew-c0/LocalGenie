import { useEffect } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { errorMessage } from "../../utils/errorMessage";

/** The one request a catalog hook makes, so its retry re-runs that request. */
const CATALOG_KEY = "catalog";

export interface CatalogLoad {
  /** The read's error text, or null while the catalog loads or after it has loaded. */
  loadError: string | null;
  /** Read the catalog again. */
  retry: () => void;
}

/**
 * A model catalog, read once when the hook mounts and handed to `setModels` when it arrives. The list
 * lives in the Playground stores, so a catalog read earlier shows at once while this read refreshes it.
 * A failed read keeps its text in `loadError`, and `retry` reads again.
 */
export function useModelCatalog<T>(
  read: () => Promise<T[]>,
  setModels: (models: T[]) => void,
  fallbackError: string,
): CatalogLoad {
  const { status, data: catalogModels, error, retry } = useAsyncData(CATALOG_KEY, () => read());

  useEffect(() => {
    if (catalogModels) setModels(catalogModels);
  }, [catalogModels, setModels]);

  return {
    loadError: status === "error" ? errorMessage(error, fallbackError) : null,
    retry,
  };
}
