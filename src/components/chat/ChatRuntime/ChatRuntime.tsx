import { useChatStream } from "./useChatStream";
import { useSessionPersistence } from "./useSessionPersistence";

/**
 * Chat side effects with no UI: streaming events and session saves. Mounted by the main layout,
 * not by the chat page, so a reply keeps streaming and saving while the user is on another page.
 */
export function ChatRuntime() {
  useChatStream();
  useSessionPersistence();
  return null;
}
