import { useAppUpdateStore } from "../../stores/appUpdateStore";
import { useBenchmarkRunStore } from "../../stores/benchmarkRunStore";
import { useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useDownloadStore } from "../../stores/downloadStore";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { RunningWork } from "../../utils/exitBlockers";

/**
 * What is running right now, read from the stores when the user asks to quit or close. The guards call it
 * at the moment of the request, so the list is current.
 */
export function readRunningWork(): RunningWork {
  const chat = useChatStore.getState();
  const appUpdateStatus = useAppUpdateStore.getState().status;
  return {
    downloads: useDownloadStore.getState().downloads,
    dispatchTasks: useDispatchStore.getState().tasks,
    chatBusy: chat.isStreaming || chat.compacting,
    benchmarkRunning: useBenchmarkRunStore.getState().phase === "running",
    playgroundImageJob: usePlaygroundStore.getState().job !== null,
    playgroundSpeechJob: useSpeechStore.getState().job !== null,
    ocrJob: useOcrStore.getState().job !== null,
    runtimeUninstalling: useRuntimeStore.getState().removingIds.length > 0,
    appUpdateBusy: appUpdateStatus === "downloading" || appUpdateStatus === "installing",
  };
}
