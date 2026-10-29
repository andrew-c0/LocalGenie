import { useEffect, useState } from "react";
import * as playground from "../../../services/playground";
import { errorMessage } from "../../../utils/errorMessage";

interface LoadedImage {
  path: string;
  dataUrl: string | null;
  error: string | null;
}

/**
 * The saved image at `path` as a data URL. The result is tagged with its path, so a previous image
 * is never shown for a new path while it loads.
 */
export function useResultImage(path: string | null): {
  dataUrl: string | null;
  error: string | null;
} {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    playground
      .readImage(path)
      .then((dataUrl) => {
        if (active) setLoaded({ path, dataUrl, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setLoaded({ path, dataUrl: null, error: errorMessage(err, "Could not open the image.") });
        }
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path || loaded?.path !== path) return { dataUrl: null, error: null };
  return { dataUrl: loaded.dataUrl, error: loaded.error };
}
