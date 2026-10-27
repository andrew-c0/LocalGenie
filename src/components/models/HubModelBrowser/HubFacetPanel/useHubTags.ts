import { useEffect, useState } from "react";
import { type HubTagCatalogue, listHubTags } from "../../../../services/hubApi";

/** The Hub's filter values, loaded once for the filter panel. `error` is set when they cannot load. */
export function useHubTags(): { tags: HubTagCatalogue | null; error: string | null } {
  const [state, setState] = useState<{ tags: HubTagCatalogue | null; error: string | null }>({
    tags: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    listHubTags()
      .then((tags) => !cancelled && setState({ tags, error: null }))
      .catch((err: unknown) => !cancelled && setState({ tags: null, error: String(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
