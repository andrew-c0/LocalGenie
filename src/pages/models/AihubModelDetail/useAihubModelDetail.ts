import { useEffect, useState } from "react";
import { type AihubModelDetail, aihubModelDetail, aihubModelReadme } from "../../../services/aihub";
import { errorMessage } from "../../../utils/errorMessage";

/**
 * Detail and model card for one AI Hub model. `readme` is `undefined` while loading, `null` when
 * there is none (a failed fetch counts as none), and the text otherwise.
 */
export function useAihubModelDetail(id: string): {
  detail: AihubModelDetail | null;
  readme: string | null | undefined;
  error: string | null;
} {
  const [detail, setDetail] = useState<AihubModelDetail | null>(null);
  const [readme, setReadme] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    aihubModelDetail(id)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, "Could not load this model."));
      });
    aihubModelReadme(id)
      .then((text) => {
        if (active) setReadme(text);
      })
      .catch(() => {
        if (active) setReadme(null);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return { detail, readme, error };
}
