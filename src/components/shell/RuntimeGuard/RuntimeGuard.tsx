import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useRuntimeLocks } from "../../../hooks/useRuntimeLocks";
import type { RuntimeNeed } from "../../../utils/runtimeGuards";
import { toast } from "../../../utils/toast";

/**
 * Route guard: renders the nested routes only while the runtime they need is installed. Otherwise it
 * sends the user to Settings > Runtimes and says why, so a link, a button or a typed URL cannot open
 * an area the sidebar has locked. A runtime state that is not read yet counts as installed.
 */
export default function RuntimeGuard({ needs }: { needs: RuntimeNeed }) {
  const reason = useRuntimeLocks()(needs);

  useEffect(() => {
    if (reason) toast.info("This area is unavailable", reason);
  }, [reason]);

  if (reason) return <Navigate to="/settings/runtimes" replace />;
  return <Outlet />;
}
