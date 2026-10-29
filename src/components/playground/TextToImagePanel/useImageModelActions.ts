import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/**
 * Download and cancel for one image model. Progress and the final outcome come from the
 * `PlaygroundRuntime` listeners, so this hook only starts the work and reports a failed start.
 */
export function useImageModelActions() {
  const startDownload = usePlaygroundStore((s) => s.startDownload);
  const failDownload = usePlaygroundStore((s) => s.failDownload);

  const download = (model: ImageModel) => {
    startDownload(model.id);
    playground.downloadImageModel(model.id).catch((err: unknown) => {
      // The done event reports failures too. Only record this one while the card still shows the download as running.
      if (usePlaygroundStore.getState().downloads[model.id]?.status === "downloading") {
        failDownload(model.id, errorMessage(err, "The download failed."));
      }
    });
  };

  const cancel = (modelId: string) => {
    playground.cancelImageModelDownload(modelId).catch((err: unknown) => {
      toast.error("Could not cancel the download", errorMessage(err));
    });
  };

  return { download, cancel };
}
