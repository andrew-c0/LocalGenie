import { shortName } from "./format";

/** Filter id that matches every model. */
export const FAMILY_ALL = "all";

/** Filter id for models whose name matches no known family. */
export const FAMILY_OTHER = "other";

/** Known model families, checked in order: a more specific family (DeepSeek distills of Qwen) wins. */
const FAMILY_RULES: { id: string; label: string; pattern: RegExp }[] = [
  { id: "deepseek", label: "DeepSeek", pattern: /deepseek/i },
  { id: "qwen", label: "Qwen", pattern: /qwen/i },
  { id: "gemma", label: "Gemma", pattern: /gemma/i },
  { id: "llama", label: "Llama", pattern: /llama/i },
  { id: "phi", label: "Phi", pattern: /(^|[-_])phi(?=[-_\d.]|$)/i },
  { id: "mistral", label: "Mistral", pattern: /mistral|mixtral/i },
  { id: "granite", label: "Granite", pattern: /granite/i },
];

/** Family id for a model name such as `qualcomm/Qwen3-4B-Instruct-2507:W4A16`. */
export function modelFamilyOf(name: string): string {
  const base = shortName(name);
  return FAMILY_RULES.find((rule) => rule.pattern.test(base))?.id ?? FAMILY_OTHER;
}

/**
 * Filter options for a list of model names: "All", one entry per family present in the list
 * (in rule order), then "Other" when any model matches no family.
 */
export function familyFilterOptions(names: string[]): [string, string][] {
  const present = new Set(names.map(modelFamilyOf));
  const options: [string, string][] = [[FAMILY_ALL, "All"]];
  for (const rule of FAMILY_RULES) {
    if (present.has(rule.id)) options.push([rule.id, rule.label]);
  }
  if (present.has(FAMILY_OTHER)) options.push([FAMILY_OTHER, "Other"]);
  return options;
}

/** True when `name` passes a family filter (`FAMILY_ALL` passes everything). */
export function matchesFamily(name: string, family: string): boolean {
  return family === FAMILY_ALL || modelFamilyOf(name) === family;
}
