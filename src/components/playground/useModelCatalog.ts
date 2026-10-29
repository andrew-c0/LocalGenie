import { useEffect, useState } from "react";
import { errorMessage } from "../../utils/errorMessage";

/**
 * A model catalog, read when its panel opens and handed to `setModels`. The list lives in the
 * Playground stores, so a catalog read earlier shows at once while this read refreshes it. Returns
 * the read error, or null.
 */
export function useModelCatalog<T>(
  read: () => Promise<T[]>,
  setModels: (models: T[]) => void,
  fallbackError: string,
): string | null {
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    read()
      .then((list) => {
        if (!active) return;
        setLoadError(null);
        setModels(list);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(errorMessage(err, fallbackError));
      });
    return () => {
      active = false;
    };
  }, [read, setModels, fallbackError]);

  return loadError;
}
