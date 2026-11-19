import type { SearchSourceInfo, ToolSpec } from "../types";
import { isOfferable } from "./webSearchSources";

/** Whether a tool's card is locked (its Chat and Dispatch choices disabled) and the line that says why. */
export interface ToolCardLock {
  locked: boolean;
  /** The reason shown under the description while locked, otherwise null. */
  note: string | null;
}

const WEB_SEARCH_NEEDS_SOURCE = "Turn on at least one search source below to use web search.";

/**
 * Locks a tool's card when the tool cannot be offered now. Only `web_search` can be locked: it needs at
 * least one turned-on search source. The stored tool states are not changed by a lock.
 */
export function toolCardLock(
  spec: ToolSpec,
  enabledIds: string[],
  sources: SearchSourceInfo[],
): ToolCardLock {
  const locked = !isOfferable(spec, enabledIds, sources);
  return { locked, note: locked ? WEB_SEARCH_NEEDS_SOURCE : null };
}
