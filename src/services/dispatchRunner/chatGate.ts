import { useChatStore } from "../../stores/chatStore";

/**
 * The chat and the Dispatch runner share the model: one streams or summarises at a time. These helpers keep a
 * Dispatch step (and a model load) from starting while a chat reply runs, and clear the streaming state a step
 * leaves behind (the chat input reads it).
 */

function chatIdle(): boolean {
  const chat = useChatStore.getState();
  return !chat.isStreaming && !chat.compacting;
}

/** Resolves once the chat is neither streaming nor summarising. */
export function waitForChatIdle(): Promise<void> {
  if (chatIdle()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useChatStore.subscribe(() => {
      if (!chatIdle()) return;
      unsubscribe();
      resolve();
    });
  });
}

/** Clears the streaming state. Called after every Dispatch request and at the end of a turn. */
export function finishStreaming(): void {
  const chat = useChatStore.getState();
  chat.setStreaming(false);
  chat.setActiveStream(null);
}
