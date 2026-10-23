/**
 * Comparison key for a model name or server id: the last path segment with any `:precision` suffix
 * removed. `unsloth/gemma-4-E4B-it-GGUF:Q4_K_M` and `unsloth/gemma-4-E4B-it-GGUF` both give
 * `gemma-4-E4B-it-GGUF`.
 */
export function shortModelKey(name: string): string {
  const last = name.split("/").pop() ?? name;
  const colon = last.indexOf(":");
  return colon === -1 ? last : last.slice(0, colon);
}
