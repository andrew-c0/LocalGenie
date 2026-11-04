import type { AsyncData } from "../../../hooks/useAsyncData";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { type AihubModelDetail, aihubModelDetail, aihubModelReadme } from "../../../services/aihub";

/**
 * Detail and model card for one AI Hub model, as two loads that start together. The detail is the
 * page: its failure gives the page a retry. The card has its own status: a null `data` means the Hub
 * has no card, so the card says so and has nothing to retry.
 */
export function useAihubModelDetail(id: string): {
  detail: AsyncData<AihubModelDetail>;
  readme: AsyncData<string | null>;
} {
  const detail = useAsyncData(id, aihubModelDetail);
  const readme = useAsyncData(id, aihubModelReadme);
  return { detail, readme };
}
