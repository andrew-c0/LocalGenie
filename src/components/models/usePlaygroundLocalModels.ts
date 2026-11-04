import { useEffect, useMemo, useState } from "react";
import * as playground from "../../services/playground";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import { errorMessage } from "../../utils/errorMessage";
import {
  collectInstalledPlaygroundModels,
  type PlaygroundLocalModel,
} from "../../utils/playgroundLocalModels";

const LOAD_ERROR = "Could not read the Playground models.";

export interface PlaygroundLocalCatalog {
  /** Every downloaded Playground model, of all tools. */
  models: PlaygroundLocalModel[];
  /** Why a catalog could not be read, or null. */
  loadError: string | null;
}

/**
 * The installed Playground models for the Local models page. The four catalogs are read once on mount
 * into the Playground stores (the same stores the tool pages use), and the list is derived from them,
 * so a delete that refreshes a store also refreshes this list. The reads are local disk, so there is no
 * skeleton; a failed read is shown as an error.
 */
export function usePlaygroundLocalModels(): PlaygroundLocalCatalog {
  const image = usePlaygroundStore((s) => s.models);
  const upscale = usePlaygroundStore((s) => s.upscaleModels);
  const speech = useSpeechStore((s) => s.models);
  const ocr = useOcrStore((s) => s.models);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      playground.listImageModels().then((list) => usePlaygroundStore.getState().setModels(list)),
      playground
        .listUpscaleModels()
        .then((list) => usePlaygroundStore.getState().setUpscaleModels(list)),
      playground.listSpeechModels().then((list) => useSpeechStore.getState().setModels(list)),
      playground.listOcrModels().then((list) => useOcrStore.getState().setModels(list)),
    ]).then((results) => {
      if (!active) return;
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      setLoadError(failed ? errorMessage(failed.reason, LOAD_ERROR) : null);
    });
    return () => {
      active = false;
    };
  }, []);

  const models = useMemo(
    () => collectInstalledPlaygroundModels({ image, upscale, speech, ocr }),
    [image, upscale, speech, ocr],
  );

  return { models, loadError };
}
