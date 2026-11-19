/**
 * The text of the toast after a model is imported. A Hugging Face model gets a hint: the selector shows
 * only capability icons a scan has confirmed (the Hub's own icons are guesses and are not stored), so
 * the model has none until it is scanned. An AI Hub model needs no hint.
 */
export function modelReadyMessage(model: string, scanHint: boolean): string {
  const base = `${model} is imported and available to load.`;
  return scanHint
    ? `${base} Open its settings and run Reload & Scan to show its capability icons in the model selector.`
    : base;
}
