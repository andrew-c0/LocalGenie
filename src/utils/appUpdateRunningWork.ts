/** What is running now, as the app's stores report it. A restart would cut off every item here. */
export interface RunningWorkSnapshot {
  /** A chat reply is streaming. */
  chatReplyStreaming: boolean;
  /** A Playground image job (text to image, image to image or upscaling) is running. */
  playgroundImageJob: boolean;
  /** A Playground speech job is running. */
  playgroundSpeechJob: boolean;
  /** An OCR job is running. */
  ocrJob: boolean;
  /** A benchmark run is in progress. */
  benchmarkRunning: boolean;
  /** Labels of the model downloads, imports and runtime installs active in the Downloads drawer. */
  activeDownloads: string[];
  /** A runtime is being uninstalled from its card. */
  runtimeRemoving: boolean;
}

/** One line per thing that is running, for the confirmation before an update restarts the app. Empty when nothing runs. */
export function runningWorkLines(snapshot: RunningWorkSnapshot): string[] {
  const lines: string[] = [];
  if (snapshot.chatReplyStreaming) lines.push("A chat reply is streaming.");
  if (snapshot.playgroundImageJob) lines.push("A Playground image job is running.");
  if (snapshot.playgroundSpeechJob) lines.push("A Playground speech job is running.");
  if (snapshot.ocrJob) lines.push("An OCR job is running.");
  if (snapshot.benchmarkRunning) lines.push("A benchmark run is in progress.");
  for (const label of snapshot.activeDownloads) lines.push(`Downloading or importing ${label}.`);
  if (snapshot.runtimeRemoving) lines.push("A runtime is being uninstalled.");
  return lines;
}
