import type {
  AttachmentFile,
  AttachmentKind,
  AttachmentRef,
  CapabilityEntry,
  CapabilityKey,
  ChatContentPart,
  ChatMessageContent,
} from "../types";
import { capabilityMap } from "./capabilityStatus";
import { scanConfirmed } from "./modelCapabilities";
import { fileSection } from "./systemPrompt";

/** Most files one message can carry. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/** A file picked for the next message. `id` is local; it is not sent. */
export type PendingAttachment = AttachmentFile & { id: string };

/** The setting that must be confirmed before the model may receive a kind of file. Text needs none. */
const KIND_KEY: Record<AttachmentKind, CapabilityKey | null> = {
  image: "vision",
  audio: "audio",
  text: null,
};

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Image",
  audio: "Audio",
  text: "Text file",
};

export function attachmentKindLabel(kind: AttachmentKind): string {
  return KIND_LABEL[kind];
}

/** Whether a model may receive a kind of file, and why not when it may not. */
export interface AttachmentGate {
  allowed: boolean;
  /** Shown beside a disabled menu item or in the send error. */
  reason?: string;
}

/**
 * Gate for one kind of file. A kind is allowed only when the model's current scan result for the
 * matching setting is "works". Null entries mean the model's results are not loaded yet.
 */
export function attachmentGate(
  kind: AttachmentKind,
  entries: CapabilityEntry[] | null,
): AttachmentGate {
  const key = KIND_KEY[kind];
  if (key === null) return { allowed: true };
  if (entries === null) {
    return { allowed: false, reason: "Model not loaded. Load a model to attach this." };
  }
  if (!scanConfirmed(capabilityMap(entries)[key])) {
    return { allowed: false, reason: "Not confirmed for this model. Run the settings scan." };
  }
  return { allowed: true };
}

/** The distinct kinds of pending files the model may not receive. Empty when all may be sent. */
export function blockedKinds(
  pending: { kind: AttachmentKind }[],
  entries: CapabilityEntry[] | null,
): AttachmentKind[] {
  const kinds = [...new Set(pending.map((p) => p.kind))];
  return kinds.filter((kind) => !attachmentGate(kind, entries).allowed);
}

/** Stored form of a pending file: the name and size, never the contents. */
export function attachmentRef(file: PendingAttachment): AttachmentRef {
  const chars =
    file.kind === "text" && file.text ? fileSection(file.name, file.text).length : undefined;
  return {
    id: file.id,
    kind: file.kind,
    name: file.name,
    size: file.size,
    path: file.path,
    chars,
  };
}

/** Longest file name shown on a tile, extension and dots included. */
export const MAX_SHOWN_NAME_LENGTH = 30;

/**
 * File name for a tile. A name longer than the limit keeps its extension and ends with "..." before
 * it, for example "a-very-long-recording-name-that-goes-on...wav". The full name is the tooltip.
 */
export function shortFileName(name: string, max = MAX_SHOWN_NAME_LENGTH): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  // An extension is kept only when a base name remains beside it.
  const ext = dot > 0 && name.length - dot < max / 2 ? name.slice(dot + 1) : "";
  const base = ext ? name.slice(0, dot) : name;
  const suffix = ext ? `...${ext}` : "...";
  return `${base.slice(0, max - suffix.length)}${suffix}`;
}

/** Audio format name the server takes, from the MIME type the backend reported. */
function audioFormat(mime: string | null): "wav" | "mp3" {
  return mime === "audio/wav" ? "wav" : "mp3";
}

/**
 * Content of a user message sent to the server. Text files are inlined with the same delimiters as
 * system prompt files. Images and audio become content parts. Without media the content stays a
 * plain string, so text-only messages are sent as before.
 */
export function userMessageContent(text: string, pending: PendingAttachment[]): ChatMessageContent {
  const textPieces = [
    text,
    ...pending.flatMap((p) => (p.kind === "text" && p.text ? [fileSection(p.name, p.text)] : [])),
  ].filter((piece) => piece.trim() !== "");
  const media = pending.flatMap((p): ChatContentPart[] => {
    if (p.kind === "image" && p.data) {
      return [{ type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}` } }];
    }
    if (p.kind === "audio" && p.data) {
      return [{ type: "input_audio", input_audio: { data: p.data, format: audioFormat(p.mime) } }];
    }
    return [];
  });
  const joined = textPieces.join("\n\n");
  if (media.length === 0) return joined;
  return [...(joined ? [{ type: "text" as const, text: joined }] : []), ...media];
}
