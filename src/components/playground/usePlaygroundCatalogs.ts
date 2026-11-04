import * as playground from "../../services/playground";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { PlaygroundModelKind } from "../../types";
import { OCR_LOAD_ERROR } from "../../utils/ocrText";
import { UPSCALE_LOAD_ERROR } from "../../utils/upscaleText";
import { type CatalogLoad, useModelCatalog } from "./useModelCatalog";

const SPEECH_LOAD_ERROR = "Could not read the speech models.";
const IMAGE_LOAD_ERROR = "Could not read the image models.";

/** The four Playground catalogs, each with its read state. */
export type PlaygroundCatalogs = Record<PlaygroundModelKind, CatalogLoad>;

/**
 * Reads the four Playground catalogs while the Playground selector is on screen, so every tool's models
 * are known to the selector (the landing lists them all). The lists go to the stores the tools read.
 */
export function usePlaygroundCatalogs(): PlaygroundCatalogs {
  const setImageModels = usePlaygroundStore((s) => s.setModels);
  const setUpscaleModels = usePlaygroundStore((s) => s.setUpscaleModels);
  const setOcrModels = useOcrStore((s) => s.setModels);
  const setSpeechModels = useSpeechStore((s) => s.setModels);

  return {
    image: useModelCatalog(playground.listImageModels, setImageModels, IMAGE_LOAD_ERROR),
    upscale: useModelCatalog(playground.listUpscaleModels, setUpscaleModels, UPSCALE_LOAD_ERROR),
    ocr: useModelCatalog(playground.listOcrModels, setOcrModels, OCR_LOAD_ERROR),
    speech: useModelCatalog(playground.listSpeechModels, setSpeechModels, SPEECH_LOAD_ERROR),
  };
}
