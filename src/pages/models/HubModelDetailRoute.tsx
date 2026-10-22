import { useLocation } from "react-router-dom";
import HubModelDetail from "./HubModelDetail";

interface HubModelDetailRouteState {
  isLocal?: boolean;
}

/** Narrow `useLocation().state` to `HubModelDetailRouteState | null`. */
function readRouteState(state: unknown): HubModelDetailRouteState | null {
  if (!state || typeof state !== "object") return null;
  return state as HubModelDetailRouteState;
}

/**
 * Route wrapper for the model detail page. Whether the model is local comes from
 * the card that opened the page (navigation state). It must NOT be recomputed from
 * the database: an HF search result can share a repo id with an installed model.
 */
export default function HubModelDetailRoute() {
  const location = useLocation();
  const isLocal = readRouteState(location.state)?.isLocal === true;
  return <HubModelDetail isLocal={isLocal} />;
}
