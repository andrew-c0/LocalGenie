import { describe, expect, it } from "vitest";
import type { AttachmentFile, AttachmentRef, Message } from "../types";
import { thumbnailSource, toolRowImage } from "./toolImage";

function ref(id: string, kind: AttachmentRef["kind"]): AttachmentRef {
  return { id, kind, name: `${id}.png`, size: 0, path: `C:/pics/${id}.png` };
}

function toolRow(attachments?: AttachmentRef[]): Message {
  return {
    id: "row",
    role: "tool",
    kind: "tool",
    content: "Image attached",
    timestamp: 1,
    attachments,
  };
}

function file(overrides: Partial<AttachmentFile>): AttachmentFile {
  return {
    kind: "image",
    name: "cat.png",
    size: 10,
    path: "C:/pics/cat.png",
    mime: "image/png",
    data: "AAAA",
    text: null,
    ...overrides,
  };
}

describe("toolRowImage", () => {
  it("returns the image attachment of a tool row", () => {
    const image = ref("cat", "image");
    expect(toolRowImage(toolRow([image]))).toBe(image);
  });

  it("skips a non-image attachment", () => {
    const image = ref("cat", "image");
    expect(toolRowImage(toolRow([ref("notes", "text"), image]))).toBe(image);
  });

  it("is null for a row without attachments", () => {
    expect(toolRowImage(toolRow())).toBeNull();
    expect(toolRowImage(toolRow([]))).toBeNull();
  });

  it("is null when the only attachment is not an image", () => {
    expect(toolRowImage(toolRow([ref("clip", "audio")]))).toBeNull();
  });
});

describe("thumbnailSource", () => {
  it("builds a data URL from the mime and the base64 data", () => {
    expect(thumbnailSource(file({ mime: "image/jpeg", data: "QUJD" }))).toBe(
      "data:image/jpeg;base64,QUJD",
    );
  });

  it("is null when no file is loaded", () => {
    expect(thumbnailSource(null)).toBeNull();
    expect(thumbnailSource(undefined)).toBeNull();
  });

  it("is null for a file that is not an image", () => {
    expect(thumbnailSource(file({ kind: "text", data: null, mime: null, text: "hi" }))).toBeNull();
  });

  it("is null when the data or the mime is missing", () => {
    expect(thumbnailSource(file({ data: null }))).toBeNull();
    expect(thumbnailSource(file({ mime: null }))).toBeNull();
  });
});
