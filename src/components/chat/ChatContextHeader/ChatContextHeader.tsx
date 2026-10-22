import { Button, makeStyles, ProgressBar, Text, tokens } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";

const MAX_CONTEXT_CHARS = 8192;

const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  spacer: {
    flex: 1,
  },
  usage: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  barTrack: {
    width: "90px",
  },
});

/** Context bar above the chat thread: model, status, context usage, close. */
export function ChatContextHeader() {
  const styles = useStyles();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const navigate = useNavigate();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  if (!activeSession) return null;

  const contextChars = activeSession.contextChars ?? 0;
  const contextPct = Math.min(100, Math.round((contextChars / MAX_CONTEXT_CHARS) * 100));

  return (
    <div className={styles.bar}>
      <Text weight="semibold">
        {activeModelId ? activeModelId.split("/").pop() : "No model selected"}
      </Text>
      <StatusBadge tone={serverStatus.running ? "cyan" : "red"}>
        {serverStatus.running ? "Inference Ready" : "Server Offline"}
      </StatusBadge>
      {isStreaming && <StatusBadge tone="purple">Streaming…</StatusBadge>}
      <div className={styles.spacer} />
      <div className={styles.usage}>
        <Text font="monospace" size={200}>
          Context: {(contextChars / 1000).toFixed(1)}k / 8k chars
        </Text>
        <ProgressBar
          className={styles.barTrack}
          value={contextPct / 100}
          color={contextPct > 90 ? "error" : "brand"}
          aria-label="Context usage"
        />
      </div>
      <Button
        appearance="subtle"
        size="small"
        icon={<DismissRegular />}
        title="Close conversation"
        aria-label="Close conversation"
        onClick={() => navigate("/chat")}
      />
    </div>
  );
}
