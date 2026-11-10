import { useBenchmarkRunStore } from "../stores/benchmarkRunStore";
import { useChatStore } from "../stores/chatStore";
import { isDownloadActive, useDownloadStore } from "../stores/downloadStore";
import { useOcrStore } from "../stores/ocrStore";
import { usePlaygroundStore } from "../stores/playgroundStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { useSpeechStore } from "../stores/speechStore";
import { runningWorkLines } from "../utils/appUpdateRunningWork";

/** What a restart would cut off right now, one line each. Empty when nothing runs. */
export function useRunningWork(): string[] {
  const chatReplyStreaming = useChatStore((s) => s.isStreaming);
  const playgroundImageJob = usePlaygroundStore((s) => s.job !== null);
  const playgroundSpeechJob = useSpeechStore((s) => s.job !== null);
  const ocrJob = useOcrStore((s) => s.job !== null);
  const benchmarkRunning = useBenchmarkRunStore((s) => s.phase === "running");
  const downloads = useDownloadStore((s) => s.downloads);
  const runtimeRemoving = useRuntimeStore((s) => s.removingIds.length > 0);

  return runningWorkLines({
    chatReplyStreaming,
    playgroundImageJob,
    playgroundSpeechJob,
    ocrJob,
    benchmarkRunning,
    activeDownloads: downloads.filter((d) => isDownloadActive(d.status)).map((d) => d.label),
    runtimeRemoving,
  });
}
