import type { SearchSourceInfo, ToolSpec } from "../types";

/**
 * Pure rules for the web search sources: which ones the user turned on, how that choice is saved, and
 * how the `web_search` tool is narrowed to them. No state and no I/O here.
 */

/** The preference key of the list of enabled search source ids. */
export const WEB_SEARCH_SOURCES_KEY = "web_search_sources";

/** The registry name of the search tool. */
export const WEB_SEARCH_TOOL = "web_search";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The saved list of enabled source ids. Accepts the stored JSON text (or the parsed array). Blank and
 * non-string entries are dropped and duplicates removed; anything unreadable reads as no sources.
 */
export function parseSourceIds(raw: unknown): string[] {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id !== "" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The id list as the JSON text stored in the preference table. */
export function serializeSourceIds(ids: string[]): string {
  return JSON.stringify(ids);
}

/**
 * The list with `id` added (`on`) or removed (`off`). Returns the same array when nothing changes, so a
 * caller can tell that no save is needed.
 */
export function toggleSource(list: string[], id: string, on: boolean): string[] {
  const present = list.includes(id);
  if (on && !present) return [...list, id];
  if (!on && present) return list.filter((item) => item !== id);
  return list;
}

/**
 * The turned-on sources, in the order the backend lists them. Ids the backend no longer offers are
 * ignored, so a stale saved id never reaches a search.
 */
export function enabledSources(
  enabledIds: string[],
  sources: SearchSourceInfo[],
): SearchSourceInfo[] {
  return sources.filter((source) => enabledIds.includes(source.id));
}

/** The ids of `enabledSources`, the list a `tool_execute` call receives. */
export function activeSourceIds(enabledIds: string[], sources: SearchSourceInfo[]): string[] {
  return enabledSources(enabledIds, sources).map((source) => source.id);
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** True when the tool can be offered now: `web_search` needs at least one turned-on source. Other tools always can. */
export function isOfferable(
  spec: ToolSpec,
  enabledIds: string[],
  sources: SearchSourceInfo[],
): boolean {
  return withEnabledSources(spec, enabledIds, sources) !== null;
}

/**
 * The spec to offer a model. For `web_search` the `source` property is narrowed to the turned-on
 * sources, and their ids and descriptions are added to its description. With no source on it returns
 * null: the tool is not offered at all. Every other tool comes back unchanged.
 */
export function withEnabledSources(
  spec: ToolSpec,
  enabledIds: string[],
  sources: SearchSourceInfo[],
): ToolSpec | null {
  if (spec.name !== WEB_SEARCH_TOOL) return spec;
  const active = enabledSources(enabledIds, sources);
  if (active.length === 0) return null;

  const properties = recordOf(spec.parameters.properties);
  const sourceProperty = recordOf(properties?.source);
  if (!properties || !sourceProperty) return spec;

  const base = typeof sourceProperty.description === "string" ? sourceProperty.description : "";
  const listing = active.map((source) => `${source.id}: ${source.description}`).join("; ");
  const description = [base, `Enabled sources: ${listing}`].filter(Boolean).join(" ");

  return {
    ...spec,
    parameters: {
      ...spec.parameters,
      properties: {
        ...properties,
        source: {
          ...sourceProperty,
          enum: active.map((source) => source.id),
          description,
        },
      },
    },
  };
}
