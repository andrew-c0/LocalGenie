import { useMemo } from "react";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { PlaygroundCatalogs } from "../../utils/playgroundLocalModels";

/**
 * The four Playground catalogs as the stores hold them, each null until it has been read. The reads
 * themselves happen in `usePlaygroundCatalogs`, which fills these stores.
 */
export function usePlaygroundStoredCatalogs(): PlaygroundCatalogs {
  const image = usePlaygroundStore((s) => s.models);
  const upscale = usePlaygroundStore((s) => s.upscaleModels);
  const speech = useSpeechStore((s) => s.models);
  const ocr = useOcrStore((s) => s.models);
  return useMemo(() => ({ image, upscale, speech, ocr }), [image, upscale, speech, ocr]);
}
