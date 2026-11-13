import { compactConversationNow } from "../services/chatCompaction";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { ChatSession } from "../types";
import { compactNowBlocker } from "../utils/compactNow";

/**
 * The Compact now action for a conversation: the reason it cannot run (null when it can), and the run
 * itself. The reason is read from the same state the run needs, so a disabled button always has one.
 */
export function useCompactNow(session: ChatSession) {
  const modelId = useModelStore((s) => s.activeModelId);
  const serverRunning = useModelStore((s) => s.serverStatus.running);
  const streaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);

  const blocker = compactNowBlocker({
    modelId,
    serverRunning,
    streaming,
    compacting,
    messages: session.messages,
  });
  const compact = () => {
    void compactConversationNow(session.id);
  };
  return { blocker, compact };
}
