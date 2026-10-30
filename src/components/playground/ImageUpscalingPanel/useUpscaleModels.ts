import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { UpscaleModel } from "../../../types";
import { UPSCALE_LOAD_ERROR } from "../../../utils/upscaleText";
import { useModelCatalog } from "../useModelCatalog";

/** The upscaling model catalog, read when the tab opens. The list lives in the Playground store, so an earlier read shows at once. */
export function useUpscaleModels(): { models: UpscaleModel[] | null; loadError: string | null } {
  const models = usePlaygroundStore((s) => s.upscaleModels);
  const setModels = usePlaygroundStore((s) => s.setUpscaleModels);
  const loadError = useModelCatalog(playground.listUpscaleModels, setModels, UPSCALE_LOAD_ERROR);

  return { models, loadError };
}
