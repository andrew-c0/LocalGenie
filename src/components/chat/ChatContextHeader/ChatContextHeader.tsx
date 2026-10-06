import { Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { StatusBadge } from "../../ui/primitives";
import "./ChatContextHeader.css";

const MAX_CONTEXT_CHARS = 8192;

/** Context bar above the chat thread: model, status, context usage, close. */
export function ChatContextHeader() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  if (!activeSession) return null;

  const contextChars = activeSession.contextChars ?? 0;
  const contextPct = Math.min(100, Math.round((contextChars / MAX_CONTEXT_CHARS) * 100));

  return (
    <div className="lx-chat-context">
      <strong className="chat-context-model">
        {activeModelId ? activeModelId.split("/").pop() : "No model selected"}
      </strong>
      <StatusBadge tone={serverStatus.running ? "cyan" : "red"}>
        {serverStatus.running ? "Inference Ready" : "Server Offline"}
      </StatusBadge>
      {isStreaming && <StatusBadge tone="purple">Streaming…</StatusBadge>}
      <span className="lx-titlebar-spacer" />
      <span className="lx-mono chat-context-usage">
        Context: {(contextChars / 1000).toFixed(1)}k / 8k chars
      </span>
      <div className="lx-progress chat-context-bar">
        <div
          className="lx-progress-fill"
          style={{
            width: `${contextPct}%`,
            background: contextPct > 90 ? "var(--lx-error)" : "var(--lx-telemetry)",
          }}
        />
      </div>
      <Button
        appearance="subtle"
        size="small"
        icon={<DismissRegular />}
        title="Close conversation"
        onClick={() => setActiveSession(null)}
      />
    </div>
  );
}
