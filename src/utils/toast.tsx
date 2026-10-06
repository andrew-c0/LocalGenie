import { Toast, ToastBody, ToastTitle } from "@fluentui/react-components";

/** Helper to build a toast element for the app toaster. */
export function makeToast(title: string, body: string) {
  return (
    <Toast>
      <ToastTitle>{title}</ToastTitle>
      <ToastBody>{body}</ToastBody>
    </Toast>
  );
}
