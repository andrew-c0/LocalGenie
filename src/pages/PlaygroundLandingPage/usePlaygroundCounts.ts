import { useEffect, useState } from "react";
import * as playground from "../../services/playground";
import { countLabel } from "../../utils/format";
import { imageToImageModels } from "../../utils/imageToImage";

/** Anything with a download state: every Playground catalog entry has one. */
interface Downloadable {
  downloaded: boolean;
}

const INSTALLED_SINGULAR = "model installed";
const INSTALLED_PLURAL = "models installed";

function installedCount(models: readonly Downloadable[]): number {
  return models.filter((model) => model.downloaded).length;
}

/**
 * Starts the catalog reads behind the landing's counts, as [route id, count] pairs. Each tool reads the
 * catalog the selector lists. The image catalog feeds two tabs (text to image lists all of it, image to image
 * its edit models). The Audio tool counts every speech model: speech to text, text to speech and clean up or split.
 */
function readInstalledCounts(): [string, Promise<number>][] {
  const images = playground.listImageModels();
  return [
    ["playground-text-to-image", images.then(installedCount)],
    ["playground-image-to-image", images.then((list) => installedCount(imageToImageModels(list)))],
    ["playground-image-upscaling", playground.listUpscaleModels().then(installedCount)],
    ["playground-ocr", playground.listOcrModels().then(installedCount)],
    ["playground-audio", playground.listSpeechModels().then(installedCount)],
  ];
}

/**
 * The live fact on each Playground landing row ("2 models installed"), keyed by route id. Each catalog is
 * read once on mount with the same services the selector uses, and is not written to the stores.
 * A row has no fact while its catalog loads, and none if the read fails.
 */
export function usePlaygroundCounts(): Record<string, string> {
  const [facts, setFacts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    for (const [routeId, count] of readInstalledCounts()) {
      count
        .then((n) => {
          if (!active) return;
          const label = countLabel(n, INSTALLED_SINGULAR, INSTALLED_PLURAL);
          setFacts((current) => ({ ...current, [routeId]: label }));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  return facts;
}
