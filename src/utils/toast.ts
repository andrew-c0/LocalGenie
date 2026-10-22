import type { ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type Notifier = (kind: ToastKind, title: string, body?: ReactNode) => void;

let notifier: Notifier | null = null;

/** Called once by `ToastRegistrar` (mounted inside the app's Toaster) to wire up Fluent's dispatcher. */
export function registerToastNotifier(fn: Notifier | null) {
  notifier = fn;
}

/**
 * Toasts for operations the user started and waits on (downloads, model loads, unloads) and their
 * failures. Usable from stores and services as well as components; a no-op until the Toaster mounts.
 */
export const toast = {
  success: (title: string, body?: ReactNode) => notifier?.("success", title, body),
  info: (title: string, body?: ReactNode) => notifier?.("info", title, body),
  error: (title: string, body?: ReactNode) => notifier?.("error", title, body),
};
