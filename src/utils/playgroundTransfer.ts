import type { PlaygroundDownloadProgress } from "../types";
import { type SpeedSample, sampleSpeed } from "./runtimeInstall";

/**
 * How far a Playground download has got in bytes, across its files. The backend reports the bytes of
 * one file at a time, so the byte count over all files is built up here from the file it moves past.
 */
export interface PlaygroundTransfer {
  /** Position of the file the latest event named, counted from 0. */
  fileIndex: number;
  fileCount: number;
  /** Bytes of the files before the current one. */
  doneBytes: number;
  /** Bytes of the current file at the latest event. */
  fileReceived: number;
  /** Size of the current file, 0 when the backend does not know it yet. */
  fileTotal: number;
  /** Bytes over all files so far, with the smoothed speed at the latest event. */
  sample: SpeedSample;
}

/** The bytes a file has finished with: its size when known, else the last count seen. */
function finishedBytes(file: Pick<PlaygroundTransfer, "fileReceived" | "fileTotal">): number {
  return Math.max(file.fileReceived, file.fileTotal);
}

/**
 * The transfer after a progress event. Moving on to a later file adds the bytes of the file before it,
 * so the count over all files keeps rising and the speed is measured across the file change too.
 */
export function advancePlaygroundTransfer(
  previous: PlaygroundTransfer | null,
  progress: PlaygroundDownloadProgress,
  at: number,
): PlaygroundTransfer {
  let doneBytes = previous?.doneBytes ?? 0;
  if (previous && progress.fileIndex > previous.fileIndex) {
    doneBytes += finishedBytes(previous);
  }
  const received = doneBytes + progress.received;
  return {
    fileIndex: progress.fileIndex,
    fileCount: progress.fileCount,
    doneBytes,
    fileReceived: progress.received,
    fileTotal: progress.total,
    sample: sampleSpeed(previous?.sample, received, at),
  };
}

/**
 * The size of the whole download, or null while it is not known. The backend names the files as it
 * goes, so the total is known only while the last file is running and its size is known.
 */
export function playgroundTotalBytes(transfer: PlaygroundTransfer): number | null {
  const onLastFile = transfer.fileIndex === transfer.fileCount - 1;
  return onLastFile && transfer.fileTotal > 0 ? transfer.doneBytes + transfer.fileTotal : null;
}
