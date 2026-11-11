import { beforeEach, describe, expect, it } from "vitest";
import { type ApprovalRequest, useToolApprovalStore } from "./toolApprovalStore";

function request(id: string, sessionId = "chat-a"): ApprovalRequest {
  return { id, sessionId, toolName: "read_text_file", arguments: '{"path":"C:\\\\a.txt"}' };
}

describe("toolApprovalStore", () => {
  beforeEach(() => {
    useToolApprovalStore.setState({ pending: [] });
  });

  it("resolves a request with the decision given for its id", async () => {
    const answer = useToolApprovalStore.getState().requestApproval(request("r1"));
    useToolApprovalStore.getState().resolveApproval("r1", "once");
    await expect(answer).resolves.toBe("once");
    expect(useToolApprovalStore.getState().pending).toEqual([]);
  });

  it("keeps requests in order and removes only the one answered", async () => {
    const first = useToolApprovalStore.getState().requestApproval(request("r1"));
    const second = useToolApprovalStore.getState().requestApproval(request("r2"));
    expect(useToolApprovalStore.getState().pending.map((p) => p.request.id)).toEqual(["r1", "r2"]);

    useToolApprovalStore.getState().resolveApproval("r2", "deny");
    await expect(second).resolves.toBe("deny");
    expect(useToolApprovalStore.getState().pending.map((p) => p.request.id)).toEqual(["r1"]);

    useToolApprovalStore.getState().resolveApproval("r1", "chat");
    await expect(first).resolves.toBe("chat");
  });

  it("does nothing for an id that is not waiting, and does not resolve twice", async () => {
    const answer = useToolApprovalStore.getState().requestApproval(request("r1"));
    useToolApprovalStore.getState().resolveApproval("missing", "once");
    expect(useToolApprovalStore.getState().pending).toHaveLength(1);

    useToolApprovalStore.getState().resolveApproval("r1", "deny");
    useToolApprovalStore.getState().resolveApproval("r1", "once");
    await expect(answer).resolves.toBe("deny");
  });

  it("cancels only the requests of the given chat", async () => {
    const mine = useToolApprovalStore.getState().requestApproval(request("r1", "chat-a"));
    const other = useToolApprovalStore.getState().requestApproval(request("r2", "chat-b"));
    const mineToo = useToolApprovalStore.getState().requestApproval(request("r3", "chat-a"));

    useToolApprovalStore.getState().cancelApprovalsFor("chat-a");

    await expect(mine).resolves.toBe("cancel");
    await expect(mineToo).resolves.toBe("cancel");
    expect(useToolApprovalStore.getState().pending.map((p) => p.request.id)).toEqual(["r2"]);

    useToolApprovalStore.getState().resolveApproval("r2", "once");
    await expect(other).resolves.toBe("once");
  });

  it("does nothing when a chat has no requests", () => {
    useToolApprovalStore.getState().cancelApprovalsFor("chat-x");
    expect(useToolApprovalStore.getState().pending).toEqual([]);
  });
});
