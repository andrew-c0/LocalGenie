import { useEffect, useState } from "react";
import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { errorMessage } from "../../../utils/errorMessage";

/**
 * The image model catalog, read when the panel opens. The list lives in the Playground store, so a
 * catalog read earlier shows at once while this one refreshes it.
 */
export function useImageModels() {
  const models = usePlaygroundStore((s) => s.models);
  const setModels = usePlaygroundStore((s) => s.setModels);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    playground
      .listImageModels()
      .then((list) => {
        if (!active) return;
        setLoadError(null);
        setModels(list);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(errorMessage(err, "Could not read the image models."));
      });
    return () => {
      active = false;
    };
  }, [setModels]);

  return { models, loadError };
}
