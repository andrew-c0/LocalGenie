import { useEffect, useState } from "react";
import { errorMessage } from "../../utils/errorMessage";

interface LoadedDataUrl {
  path: string;
  dataUrl: string | null;
  error: string | null;
}

/**
 * A saved file at `path` as a data URL, read with `read` (the image or audio reader of the service).
 * The result is tagged with its path, so a previous file is never shown for a new path while it loads.
 */
export function useSavedDataUrl(
  path: string | null,
  read: (path: string) => Promise<string>,
  fallbackError: string,
): { dataUrl: string | null; error: string | null } {
  const [loaded, setLoaded] = useState<LoadedDataUrl | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    read(path)
      .then((dataUrl) => {
        if (active) setLoaded({ path, dataUrl, error: null });
      })
      .catch((err: unknown) => {
        if (active) setLoaded({ path, dataUrl: null, error: errorMessage(err, fallbackError) });
      });
    return () => {
      active = false;
    };
  }, [path, read, fallbackError]);

  if (!path || loaded?.path !== path) return { dataUrl: null, error: null };
  return { dataUrl: loaded.dataUrl, error: loaded.error };
}
