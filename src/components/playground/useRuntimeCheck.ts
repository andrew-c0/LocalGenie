import { useEffect, useState } from "react";
import { listRuntimes } from "../../services/runtimes";
import { errorMessage } from "../../utils/errorMessage";
import type { RuntimeStatus } from "../../utils/playground";

interface RuntimeCheck {
  status: RuntimeStatus;
  /** Why the check failed, when `status` is `failed`. */
  error: string | null;
}

/**
 * Whether an optional runtime (by its registry id) is installed. Checked each time a tab opens, since
 * the user can install it in Settings.
 */
export function useRuntimeCheck(runtimeId: string): RuntimeCheck {
  const [check, setCheck] = useState<RuntimeCheck>({ status: "checking", error: null });

  useEffect(() => {
    let active = true;
    listRuntimes()
      .then((list) => {
        if (!active) return;
        const installed = list.some(
          (runtime) => runtime.id === runtimeId && runtime.installedVersion !== null,
        );
        setCheck({ status: installed ? "installed" : "missing", error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setCheck({ status: "failed", error: errorMessage(err, "Could not read the runtimes.") });
        }
      });
    return () => {
      active = false;
    };
  }, [runtimeId]);

  return check;
}
