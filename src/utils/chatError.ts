/** On-screen text for a chat error. Live errors and errors restored on reload use the same format. */
export function chatErrorContent(error: string): string {
  return `⚠️ Error: ${error}`;
}

/** The server's code for a prompt longer than the model's context window. */
const CONTEXT_OVERFLOW_CODE = "context_length_exceeded";

/** True when a send failed because the prompt does not fit the context window. */
export function isContextOverflow(error: string): boolean {
  return error.includes(CONTEXT_OVERFLOW_CODE);
}
