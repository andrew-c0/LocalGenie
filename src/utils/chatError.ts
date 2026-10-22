/** On-screen text for a chat error. Live errors and errors restored on reload use the same format. */
export function chatErrorContent(error: string): string {
  return `⚠️ Error: ${error}`;
}
