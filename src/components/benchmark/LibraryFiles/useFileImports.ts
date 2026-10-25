import { useCallback, useEffect, useRef } from "react";
import { pickAttachment } from "../../../services/attachments";
import { discardBenchmarkFile, importBenchmarkFile } from "../../../services/benchmark";
import type { AttachmentKind, BenchmarkFile } from "../../../types";

function discardQuietly(id: string) {
  void discardBenchmarkFile(id).catch(() => undefined);
}

/**
 * Files one editor copied into the library but has not saved yet. A save discards the ones the
 * saved item does not keep; discarding changes or closing the editor discards all of them.
 */
export function useFileImports() {
  const pending = useRef(new Set<string>());

  // Unmount clean-up. Nothing is pending on mount, so a second run under StrictMode is harmless.
  useEffect(() => {
    const ids = pending.current;
    return () => {
      for (const id of ids) discardQuietly(id);
      ids.clear();
    };
  }, []);

  /** Ask for a file of one kind and copy it into the library. Null when the dialog is cancelled. */
  const importFile = useCallback(async (kind: AttachmentKind): Promise<BenchmarkFile | null> => {
    const path = await pickAttachment(kind);
    if (!path) return null;
    const file = await importBenchmarkFile(path, crypto.randomUUID());
    pending.current.add(file.id);
    return file;
  }, []);

  /** After a save: discard every pending copy that the saved item does not keep. */
  const settle = useCallback((kept: Iterable<string>) => {
    const keep = new Set(kept);
    for (const id of pending.current) {
      if (!keep.has(id)) discardQuietly(id);
    }
    pending.current.clear();
  }, []);

  /** Discard every pending copy, for "Discard changes". */
  const discardAll = useCallback(() => settle([]), [settle]);

  return { importFile, settle, discardAll };
}
