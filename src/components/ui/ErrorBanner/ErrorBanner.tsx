import "./ErrorBanner.css";

/** Inline error banner used across pages. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="lx-hw-banner error-banner" role="alert">
      ⚠ {message}
    </div>
  );
}
