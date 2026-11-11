import { create } from "zustand";

/** The user's answer to one tool call: run it once, allow the chat, deny it, or stop it (the chat was stopped). */
export type ApprovalDecision = "once" | "chat" | "deny" | "cancel";

/** A tool call that waits for the user's answer. */
export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolName: string;
  /** The raw JSON arguments the model sent. */
  arguments: string;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
}

interface ToolApprovalState {
  /** Requests waiting for an answer, oldest first. The dialog shows the first one. */
  pending: PendingApproval[];
  /** Queues a request. Resolves with the user's decision once it is answered. */
  requestApproval: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  /** Answers the request with this id. An unknown id does nothing. */
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
  /** Answers every request of a chat with "cancel", so no prompt is left for a chat that is gone or stopped. */
  cancelApprovalsFor: (sessionId: string) => void;
}

/** Tool calls waiting for the user's approval. Mounted once by `ToolApprovalDialog`. */
export const useToolApprovalStore = create<ToolApprovalState>((set, get) => ({
  pending: [],

  requestApproval: (request) =>
    new Promise((resolve) => {
      set((state) => ({ pending: [...state.pending, { request, resolve }] }));
    }),

  resolveApproval: (id, decision) => {
    const entry = get().pending.find((item) => item.request.id === id);
    if (!entry) return;
    set((state) => ({ pending: state.pending.filter((item) => item !== entry) }));
    entry.resolve(decision);
  },

  cancelApprovalsFor: (sessionId) => {
    const ids = get()
      .pending.filter((item) => item.request.sessionId === sessionId)
      .map((item) => item.request.id);
    for (const id of ids) get().resolveApproval(id, "cancel");
  },
}));
