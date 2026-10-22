import { Toast, ToastBody, ToastTitle, useToastController } from "@fluentui/react-components";
import { type ReactNode, useEffect } from "react";
import { registerToastNotifier } from "../utils/toast";

/** Id shared with the `<Toaster>` mounted in `App.tsx`. */
export const APP_TOASTER_ID = "app-toaster";

/** Routes `utils/toast` calls to the app's Fluent Toaster. Renders nothing. */
export function ToastRegistrar() {
  const { dispatchToast } = useToastController(APP_TOASTER_ID);

  useEffect(() => {
    registerToastNotifier((kind, title, body?: ReactNode) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent: kind, timeout: kind === "error" ? 8000 : 4000 },
      );
    });
    return () => registerToastNotifier(null);
  }, [dispatchToast]);

  return null;
}
