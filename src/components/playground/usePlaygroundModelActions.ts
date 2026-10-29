import { cancelModelDownload } from "../../services/playground";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { errorMessage } from "../../utils/errorMessage";
import { toast } from "../../utils/toast";

export interface PlaygroundModelActions {
  download: (modelId: string) => void;
  cancel: (modelId: string) => void;
}

/**
 * Download and cancel for one model of a Playground tab. `downloadModel` starts the download of the
 * tab's kind of model. Progress and the final outcome come from the `PlaygroundRuntime` listeners, so
 * this hook only starts the work and reports a failed start.
 */
export function usePlaygroundModelActions(
  downloadModel: (modelId: string) => Promise<void>,
): PlaygroundModelActions {
  const download = (modelId: string) => {
    usePlaygroundStore.getState().startDownload(modelId);
    downloadModel(modelId).catch((err: unknown) => {
      // The done event reports failures too. Only record this one while the card still shows the download as running.
      if (usePlaygroundStore.getState().downloads[modelId]?.status === "downloading") {
        usePlaygroundStore
          .getState()
          .failDownload(modelId, errorMessage(err, "The download failed."));
      }
    });
  };

  const cancel = (modelId: string) => {
    cancelModelDownload(modelId).catch((err: unknown) => {
      toast.error("Could not cancel the download", errorMessage(err));
    });
  };

  return { download, cancel };
}
