import { describe, expect, it } from "vitest";
import {
  modelChangeFault,
  queuedNoteFor,
  serverModelRefusal,
  type TurnState,
  turnRefusal,
} from "./dispatchStart";

const READY: TurnState = { own: "idle", chatBusy: false, serverRunning: true, modelLoaded: true };

describe("turnRefusal", () => {
  it("allows a message when the server runs, a model is loaded and nothing else is busy", () => {
    expect(turnRefusal(READY)).toBeNull();
  });

  it("refuses a conversation that is working, and says so", () => {
    expect(turnRefusal({ ...READY, own: "working" })).toBe(
      "This conversation is working. Wait for its reply, or stop it.",
    );
  });

  it("refuses a conversation that is already queued", () => {
    expect(turnRefusal({ ...READY, own: "queued" })).toBe(
      "This conversation is queued. It starts when the running one finishes.",
    );
  });

  it("waits while a chat reply or summary runs", () => {
    expect(turnRefusal({ ...READY, chatBusy: true })).toBe(
      "Wait for the chat reply to finish before sending.",
    );
  });

  it("says why when the server is stopped or no model is loaded", () => {
    expect(turnRefusal({ ...READY, serverRunning: false })).toBe(
      "Start the GenieX server to run a conversation.",
    );
    expect(turnRefusal({ ...READY, modelLoaded: false })).toBe(
      "Load a model to run a conversation.",
    );
  });

  it("checks the conversation before the chat, the server and the model", () => {
    expect(
      turnRefusal({ own: "working", chatBusy: true, serverRunning: false, modelLoaded: false }),
    ).toBe("This conversation is working. Wait for its reply, or stop it.");
  });
});

describe("serverModelRefusal", () => {
  it("is null when the server runs and a model is loaded", () => {
    expect(serverModelRefusal({ serverRunning: true, modelLoaded: true })).toBeNull();
  });
});

describe("queuedNoteFor", () => {
  it("says the message is queued while another conversation runs", () => {
    expect(queuedNoteFor("other", "mine")).toContain("queued");
    expect(queuedNoteFor("other", null)).toContain("queued");
  });

  it("is null when nothing runs, or when this conversation is the running one", () => {
    expect(queuedNoteFor(null, "mine")).toBeNull();
    expect(queuedNoteFor("mine", "mine")).toBeNull();
  });
});

describe("modelChangeFault", () => {
  it("is null while the model is the one the turn started on", () => {
    expect(modelChangeFault("m", "m")).toBeNull();
  });

  it("fails when the loaded model changed during the turn", () => {
    expect(modelChangeFault("m", "other")).toBe(
      "The loaded model changed from m to other. The conversation needs the model it started with.",
    );
  });

  it("fails when no model is loaded", () => {
    expect(modelChangeFault("m", null)).toMatch(/^No model is loaded/);
  });

  it("allows a turn that started with no model recorded", () => {
    expect(modelChangeFault(null, "m")).toBeNull();
  });
});
