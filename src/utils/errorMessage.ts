/** Text for an error caught from a Tauri command (a string) or any other thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
