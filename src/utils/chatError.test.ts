import { describe, expect, it } from "vitest";
import { chatErrorContent, isContextOverflow } from "./chatError";

describe("isContextOverflow", () => {
  it("is true for the server's context_length_exceeded error, as the send reports it", () => {
    const error =
      'Server returned 400 Bad Request: {"error":{"code":"context_length_exceeded","message":"prompt is too long"}}';
    expect(isContextOverflow(error)).toBe(true);
  });

  it("is false for other errors", () => {
    expect(isContextOverflow("Server returned 500 Internal Server Error: boom")).toBe(false);
    expect(isContextOverflow("Stream error: connection reset")).toBe(false);
  });

  it("does not depend on the on-screen error text", () => {
    expect(isContextOverflow(chatErrorContent("context_length_exceeded"))).toBe(true);
  });
});
