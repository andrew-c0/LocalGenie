import * as playground from "../../../services/playground";
import { useOcrStore } from "../../../stores/ocrStore";
import type { OcrModel } from "../../../types";
import { OCR_LOAD_ERROR } from "../../../utils/ocrText";
import { useModelCatalog } from "../useModelCatalog";

/** The OCR model catalog, read when the tab opens. The list lives in the OCR store, so an earlier read shows at once. */
export function useOcrModels(): { models: OcrModel[] | null; loadError: string | null } {
  const models = useOcrStore((s) => s.models);
  const setModels = useOcrStore((s) => s.setModels);
  const loadError = useModelCatalog(playground.listOcrModels, setModels, OCR_LOAD_ERROR);

  return { models, loadError };
}
