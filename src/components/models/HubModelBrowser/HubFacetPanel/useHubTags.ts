import { type AsyncData, useAsyncData } from "../../../../hooks/useAsyncData";
import { type HubTagCatalogue, listHubTags } from "../../../../services/hubApi";

/**
 * The Hub's filter values (library, licence, ...), loaded once for the filter panel. The status
 * drives the skeleton and the retry; `retry` asks the Hub again (a failed fetch is not cached).
 */
export function useHubTags(): AsyncData<HubTagCatalogue> {
  // The catalogue is one request, so its key is a constant.
  return useAsyncData("hub-tags", listHubTags);
}
