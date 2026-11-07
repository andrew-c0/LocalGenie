/** The part of a document `pageStyleNonce` reads, so a test can pass a stub. */
interface NonceSource {
  querySelectorAll(selectors: string): Iterable<{ nonce?: string }>;
}

/**
 * The nonce Tauri puts on the page's own `<style>` and `<script>` tags in a production build. Its content
 * security policy then lists `'nonce-...'` for styles and ignores `'unsafe-inline'`, so a style tag that a
 * library adds at runtime (Fluent UI's Griffel) is blocked unless it carries the same nonce. Browsers hide
 * the `nonce` attribute but keep the value on the element's `nonce` property. Undefined in `tauri dev`,
 * where no nonce is added and none is needed.
 */
export function pageStyleNonce(doc: NonceSource = document): string | undefined {
  for (const element of doc.querySelectorAll("style, script")) {
    if (element.nonce) return element.nonce;
  }
  return undefined;
}

/** The attributes for a style tag the page adds itself: the nonce when the page has one, else none. */
export function styleTagAttributes(nonce: string | undefined): Record<string, string> {
  return nonce ? { nonce } : {};
}
