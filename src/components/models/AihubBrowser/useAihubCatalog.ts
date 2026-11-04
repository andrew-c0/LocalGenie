import { type LoadStatus, useAsyncData } from "../../../hooks/useAsyncData";
import { type AihubCatalogEntry, aihubListModels } from "../../../services/aihub";

/** The catalog is one request, so it has one key. */
const CATALOG_KEY = "aihub-catalog";

/**
 * Catalog list for the Qualcomm AI Hub tab. `entries` is null while loading and after a failure;
 * `error` is set on a failure, and `retry` runs the request again.
 */
export function useAihubCatalog(): {
  entries: AihubCatalogEntry[] | null;
  status: LoadStatus;
  error: unknown;
  retry: () => void;
} {
  const catalog = useAsyncData(CATALOG_KEY, aihubListModels);
  return {
    entries: catalog.data,
    status: catalog.status,
    error: catalog.error,
    retry: catalog.retry,
  };
}
