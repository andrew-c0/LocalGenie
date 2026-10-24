import { describe, expect, it } from "vitest";
import type { CapabilityEntry, CapabilityKey } from "../types";
import {
  attachmentGate,
  blockedKinds,
  type PendingAttachment,
  shortFileName,
  userMessageContent,
} from "./attachments";

function entry(
  key: CapabilityKey,
  status: CapabilityEntry["status"],
  stale = false,
): CapabilityEntry {
  return { key, status, detail: null, probedAt: 1, stale };
}

function file(
  partial: Partial<PendingAttachment> & Pick<PendingAttachment, "kind">,
): PendingAttachment {
  return {
    id: "f1",
    path: "/files/file",
    name: "file",
    size: 1,
    mime: null,
    data: null,
    text: null,
    ...partial,
  };
}

describe("attachmentGate", () => {
  const scanned = [entry("vision", "works"), entry("audio", "rejected")];

  it("always allows text files", () => {
    expect(attachmentGate("text", null).allowed).toBe(true);
    expect(attachmentGate("text", [])).toEqual({ allowed: true });
  });

  it("allows an image only when vision is confirmed as works", () => {
    expect(attachmentGate("image", scanned).allowed).toBe(true);
    expect(attachmentGate("image", [entry("vision", "accepted")]).allowed).toBe(false);
    expect(attachmentGate("image", [entry("vision", "works", true)]).allowed).toBe(false);
    expect(attachmentGate("image", []).allowed).toBe(false);
  });

  it("refuses audio when the scan rejected it", () => {
    const gate = attachmentGate("audio", scanned);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/scan/);
  });

  it("refuses media while the model's results are not loaded", () => {
    expect(attachmentGate("image", null).allowed).toBe(false);
  });
});

describe("blockedKinds", () => {
  it("lists each blocked kind once", () => {
    const pending = [
      file({ kind: "image" }),
      file({ kind: "image", id: "f2" }),
      file({ kind: "audio", id: "f3" }),
      file({ kind: "text", id: "f4" }),
    ];
    expect(blockedKinds(pending, [])).toEqual(["image", "audio"]);
  });

  it("is empty when every kind is allowed", () => {
    const pending = [file({ kind: "image" }), file({ kind: "text", id: "f2" })];
    expect(blockedKinds(pending, [entry("vision", "works")])).toEqual([]);
  });
});

describe("userMessageContent", () => {
  it("stays a plain string for text-only messages", () => {
    expect(userMessageContent("hello", [])).toBe("hello");
  });

  it("inlines a text file with the file delimiters", () => {
    const notes = file({ kind: "text", name: "notes.md", text: "# Notes\nBe brief." });
    expect(userMessageContent("Summarise", [notes])).toBe(
      "Summarise\n\n--- file: notes.md ---\n# Notes\nBe brief.\n--- end of file ---",
    );
  });

  it("returns content parts when an image is attached", () => {
    const image = file({ kind: "image", mime: "image/png", data: "AAAA" });
    expect(userMessageContent("What is this?", [image])).toEqual([
      { type: "text", text: "What is this?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("omits the text part when the message has only media", () => {
    const clip = file({ kind: "audio", mime: "audio/wav", data: "BBBB" });
    expect(userMessageContent("", [clip])).toEqual([
      { type: "input_audio", input_audio: { data: "BBBB", format: "wav" } },
    ]);
  });

  it("sends mp3 clips as mp3", () => {
    const clip = file({ kind: "audio", mime: "audio/mpeg", data: "CCCC" });
    expect(userMessageContent("", [clip])).toEqual([
      { type: "input_audio", input_audio: { data: "CCCC", format: "mp3" } },
    ]);
  });

  it("puts inlined text ahead of the media parts", () => {
    const notes = file({ kind: "text", name: "a.txt", text: "context", id: "t" });
    const image = file({ kind: "image", mime: "image/webp", data: "DDDD", id: "i" });
    const content = userMessageContent("Describe", [notes, image]);
    expect(Array.isArray(content) && content[0]).toEqual({
      type: "text",
      text: "Describe\n\n--- file: a.txt ---\ncontext\n--- end of file ---",
    });
    expect(Array.isArray(content) && content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/webp;base64,DDDD" },
    });
  });
});

describe("shortFileName", () => {
  it("leaves a name of 30 characters or fewer alone", () => {
    expect(shortFileName("notes.md")).toBe("notes.md");
    const exact = `${"a".repeat(26)}.txt`;
    expect(exact).toHaveLength(30);
    expect(shortFileName(exact)).toBe(exact);
  });

  it("cuts a long name to 30 characters with dots and keeps the extension", () => {
    const short = shortFileName("a-very-long-recording-name-that-goes-on-and-on.wav");
    expect(short).toBe("a-very-long-recording-na...wav");
    expect(short).toHaveLength(30);
  });

  it("keeps the extension of a long name with a short extension", () => {
    const short = shortFileName(`${"x".repeat(40)}.mp3`);
    expect(short.endsWith("...mp3")).toBe(true);
    expect(short).toHaveLength(30);
  });

  it("cuts a long name with no extension to 30 characters ending in dots", () => {
    const short = shortFileName("q".repeat(50));
    expect(short).toBe(`${"q".repeat(27)}...`);
  });
});
