import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageModel } from "../../../types";
import { useModelCatalog } from "../useModelCatalog";

/**
 * The image model catalog, read when the panel opens. The list lives in the Playground store, so a
 * catalog read earlier shows at once while this one refreshes it.
 */
export function useImageModels(): { models: ImageModel[] | null; loadError: string | null } {
  const models = usePlaygroundStore((s) => s.models);
  const setModels = usePlaygroundStore((s) => s.setModels);
  const loadError = useModelCatalog(
    playground.listImageModels,
    setModels,
    "Could not read the image models.",
  );

  return { models, loadError };
}
