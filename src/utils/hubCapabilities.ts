import type { CapabilityBadge } from "./modelCapabilities";

/**
 * What a Hugging Face model can do, inferred from the list data it already has: the tags, the
 * pipeline tag and the GGUF chat template. These are heuristics and the card labels them as
 * inferred. A missing chat template means unknown, so tools and thinking come out false, not "no".
 */

/** The capabilities a browse card shows as icons. */
export interface HubCapabilities {
  vision: boolean;
  tools: boolean;
  thinking: boolean;
}

/** The Hub fields the capabilities are read from. A list response has them all. */
export interface HubCapabilitySource {
  tags?: string[];
  pipeline_tag?: string;
  gguf?: { chat_template?: string };
}

const VISION_TAGS = ["vision", "multimodal"];
const VISION_PIPELINES = ["image-text-to-text", "visual-question-answering", "any-to-any"];
/** Template words that render tool definitions or tool calls. Same words as the backend's `mentions_tool_calls`. */
const TOOL_MARKERS = ["tool_call", "tools"];
/**
 * Template words that mark a reasoning mode. Matched in lower case. The backend's `mentions_thinking`
 * list, plus `reasoning` (which also covers `reasoning_content`).
 */
const THINKING_MARKERS = ["<think>", "</think>", "<|think|>", "enable_thinking", "reasoning"];

/**
 * The inferred capabilities as card icons, in the selector's order (tools, thinking, vision). Each
 * label says where the guess came from. A capability that is false adds no icon.
 */
export function inferredCapabilityBadges(caps: HubCapabilities): CapabilityBadge[] {
  const badges: CapabilityBadge[] = [];
  if (caps.tools) {
    badges.push({
      id: "tools",
      label: "Tools: the chat template supports tool calls (inferred from the chat template)",
    });
  }
  if (caps.thinking) {
    badges.push({
      id: "thinking",
      label: "Thinking: the chat template has a reasoning mode (inferred from the chat template)",
    });
  }
  if (caps.vision) {
    badges.push({ id: "vision", label: "Vision: reads images (inferred from the model's tags)" });
  }
  return badges;
}

/** Vision, tool-call and thinking hints of one model. Pure: the template is read, not kept. */
export function inferredCapabilities(model: HubCapabilitySource): HubCapabilities {
  const template = model.gguf?.chat_template ?? "";
  const lowerTemplate = template.toLowerCase();
  return {
    vision:
      (model.tags ?? []).some((tag) => VISION_TAGS.includes(tag)) ||
      VISION_PIPELINES.includes(model.pipeline_tag ?? ""),
    tools: TOOL_MARKERS.some((marker) => template.includes(marker)),
    thinking: THINKING_MARKERS.some((marker) => lowerTemplate.includes(marker)),
  };
}
