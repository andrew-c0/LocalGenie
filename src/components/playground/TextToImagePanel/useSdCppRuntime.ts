import { useEffect, useState } from "react";
import { listRuntimes } from "../../../services/runtimes";
import { errorMessage } from "../../../utils/errorMessage";
import type { SdCppStatus } from "../../../utils/playground";
import { SD_CPP_RUNTIME_ID } from "../../../utils/playground";

interface SdCppRuntimeCheck {
  status: SdCppStatus;
  /** Why the check failed, when `status` is `failed`. */
  error: string | null;
}

/** Whether stable-diffusion.cpp is installed. Checked each time the panel opens, since the user can install it in Settings. */
export function useSdCppRuntime(): SdCppRuntimeCheck {
  const [check, setCheck] = useState<SdCppRuntimeCheck>({ status: "checking", error: null });

  useEffect(() => {
    let active = true;
    listRuntimes()
      .then((list) => {
        if (!active) return;
        const installed = list.some(
          (runtime) => runtime.id === SD_CPP_RUNTIME_ID && runtime.installedVersion !== null,
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
  }, []);

  return check;
}
