import type { PlatformInfo, StoredModelSettings, SystemPromptBlock } from "../types";

/** Platform details for the platform block: the OS probe plus the chipset from startup. */
export interface PlatformSnapshot extends PlatformInfo {
  /** Chipset name, or null when the probe failed or returned nothing useful. */
  chipset: string | null;
}

/** Inputs that change between sends. Passed in so composition stays testable. */
export interface PromptContext {
  now: Date;
  timeZone: string;
  platform: PlatformSnapshot | null;
  readFile: (path: string) => Promise<string>;
}

export interface ComposedPrompt {
  /** The system prompt sent to the server. Empty when no block contributes text. */
  prompt: string;
  /** Names of attached files that could not be read. Those blocks are left out. */
  skipped: string[];
}

/** Rough token count from text length, about 4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Human-readable file size, for example "512 B" or "1.5 KB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Current local date and time, for example "Thursday 22 October 2026 at 14:05:09". */
export function formatDateTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(now);
}

/** The IANA time zone of this machine, for example "Europe/Bucharest". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The date and time sentence sent for a date block. */
export function dateTimeSentence(now: Date, timeZone: string): string {
  return `Current date and time: ${formatDateTime(now, timeZone)} (${timeZone}).`;
}

/**
 * The platform sentence sent for a platform block, or null when there is no platform info. The
 * chipset part is omitted when it is unknown.
 */
export function platformLine(platform: PlatformSnapshot | null): string | null {
  if (!platform) return null;
  const osLabel = platform.osVersion.includes(platform.os)
    ? platform.osVersion
    : [platform.os, platform.osVersion].filter(Boolean).join(" ");
  const parts = [osLabel, platform.arch];
  if (platform.totalMemoryBytes > 0) {
    parts.push(`${Math.round(platform.totalMemoryBytes / 1024 ** 3)} GB RAM`);
  }
  const chipset = platform.chipset?.trim();
  if (chipset && chipset.toLowerCase() !== "unknown") parts.push(`chipset ${chipset}`);
  return `Platform: ${parts.join(", ")}.`;
}

/** Wraps a file's contents with delimiters so the model can tell where the file starts and ends. */
export function fileSection(name: string, contents: string): string {
  return `--- file: ${name} ---\n${contents.trim()}\n--- end of file ---`;
}

/**
 * Builds the system prompt for one send. Blocks keep their order and are joined by a blank line.
 * Empty text blocks are skipped. A file that cannot be read is skipped and reported in `skipped`.
 */
export async function composeSystemPrompt(
  blocks: SystemPromptBlock[],
  ctx: PromptContext,
): Promise<ComposedPrompt> {
  const parts: string[] = [];
  const skipped: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "text":
        if (block.text.trim()) parts.push(block.text.trim());
        break;
      case "datetime":
        parts.push(dateTimeSentence(ctx.now, ctx.timeZone));
        break;
      case "platform": {
        const line = platformLine(ctx.platform);
        if (line) parts.push(line);
        break;
      }
      case "file":
        try {
          parts.push(fileSection(block.name, await ctx.readFile(block.path)));
        } catch {
          skipped.push(block.name);
        }
        break;
    }
  }
  return { prompt: parts.join("\n\n"), skipped };
}

/**
 * The blocks a model's settings describe. Saved settings from before blocks existed hold one
 * `systemPrompt` string, which becomes a single text block.
 */
export function blocksOf(settings: Pick<StoredModelSettings, "systemPrompt" | "systemBlocks">) {
  if (settings.systemBlocks) return settings.systemBlocks;
  if (settings.systemPrompt?.trim()) {
    return [{ id: "legacy-text", kind: "text" as const, text: settings.systemPrompt }];
  }
  return [];
}

/**
 * Settings with `systemBlocks` filled in from the legacy `systemPrompt`. The legacy field is
 * dropped, so the next save writes blocks only.
 */
export function withSystemBlocks(settings: StoredModelSettings): StoredModelSettings {
  const { systemPrompt: _legacy, ...rest } = settings;
  return { ...rest, systemBlocks: blocksOf(settings) };
}
