import { Button, makeStyles, ProgressBar, Text, tokens } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";

/** Rough characters-per-token ratio used to estimate how much of the window the chat fills. */
const CHARS_PER_TOKEN = 4;

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
    width: "120px",
  },
});

/** Context bar above the chat thread: model, server state, context usage vs. the model's window, close. */
export function ChatContextHeader() {
  const styles = useStyles();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const navigate = useNavigate();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  /** Native context window of the active model in tokens; null when it was never recorded. */
  const [contextWindow, setContextWindow] = useState<number | null>(null);

  // The window is stored with the downloaded-model row; re-read when the model or the list changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: models is the trigger, the row is read from the DB
  useEffect(() => {
    if (!activeModelId) {
      setContextWindow(null);
      return;
    }
    const repoId = activeModelId.split(":")[0];
    let cancelled = false;
    db.listDownloadedModels()
      .then((rows) => {
        if (!cancelled) setContextWindow(rows.find((r) => r.name === repoId)?.context_size ?? null);
      })
      .catch(() => {
        if (!cancelled) setContextWindow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelId, models]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  if (!activeSession) return null;

  const usedTokens = Math.round((activeSession.contextChars ?? 0) / CHARS_PER_TOKEN);
  const contextPct =
    contextWindow && contextWindow > 0
      ? Math.min(100, Math.round((usedTokens / contextWindow) * 100))
      : null;

  return (
    <div className={styles.bar}>
      <Text weight="semibold">
        {activeModelId ? activeModelId.split("/").pop() : "No model selected"}
      </Text>
      {!serverStatus.running && <StatusBadge tone="red">Server Offline</StatusBadge>}
      <div className={styles.spacer} />
      <div className={styles.usage}>
        {contextWindow && contextPct !== null ? (
          <>
            <Text size={200}>
              Context: ~{formatCount(usedTokens)} / {formatCount(contextWindow)} tokens
            </Text>
            <ProgressBar
              className={styles.barTrack}
              value={contextPct / 100}
              color={contextPct > 90 ? "error" : "brand"}
              aria-label="Context usage"
            />
          </>
        ) : (
          <Text size={200}>
            {activeModelId
              ? `Context: ~${formatCount(usedTokens)} tokens · window unknown`
              : `Context: ~${formatCount(usedTokens)} tokens`}
          </Text>
        )}
      </div>
      <Button
        appearance="subtle"
        icon={<DismissRegular />}
        title="Close conversation"
        aria-label="Close conversation"
        onClick={() => navigate("/chat")}
      />
    </div>
  );
}
