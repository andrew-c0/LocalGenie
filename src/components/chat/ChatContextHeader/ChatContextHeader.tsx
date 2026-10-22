import { Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import { ContextRing } from "./ContextRing/ContextRing";
import "./ChatContextHeader.css";

/** Rough characters-per-token ratio used to estimate how much of the window the chat fills. */
const CHARS_PER_TOKEN = 4;

/** Context bar above the chat thread: model, server state, context usage vs. the model's window, close. */
export function ChatContextHeader() {
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
        // The active model may be stored by short name, the database by repo id: compare base names.
        const baseId = repoId.split("/").pop();
        const row = rows.find((r) => r.name.split("/").pop() === baseId);
        if (!cancelled) setContextWindow(row?.context_size ?? null);
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
    <div className="chat-context-header__bar">
      {!serverStatus.running && <StatusBadge tone="red">Server Offline</StatusBadge>}
      <BodyStrong truncate title={activeSession.title} className="chat-context-header__title">
        {activeSession.title}
      </BodyStrong>
      <div className="chat-context-header__usage">
        {contextWindow && contextPct !== null ? (
          <ContextRing
            percent={contextPct}
            label={`${formatCount(usedTokens)} out of ${formatCount(contextWindow)} tokens used`}
          />
        ) : (
          <Meta>
            {activeModelId
              ? `~${formatCount(usedTokens)} tokens used · window unknown`
              : `~${formatCount(usedTokens)} tokens used`}
          </Meta>
        )}
      </div>
      <Button
        appearance="secondary"
        icon={<DismissRegular />}
        title="Close conversation"
        aria-label="Close conversation"
        onClick={() => navigate("/chat")}
      />
    </div>
  );
}
