import { Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { contextUsageOf } from "../../../utils/contextUsage";
import { formatCount } from "../../../utils/format";
import { modelSettingsKey } from "../../../utils/modelSettings";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import { ContextRing } from "./ContextRing/ContextRing";
import "./ChatContextHeader.css";

/** Context bar above the chat thread: model, server state, context usage vs. the model's window, close. */
export function ChatContextHeader() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const navigate = useNavigate();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  /** Context window in tokens: the saved setting, else the model's own. Null when neither is known. */
  const [contextWindow, setContextWindow] = useState<number | null>(null);

  // The window is the saved setting, else the model's own (stored with the downloaded-model row).
  // Re-read when the model, the list or the server changes, since a reload can change the setting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: models and server status are the triggers, the values are read from the DB
  useEffect(() => {
    if (!activeModelId) {
      setContextWindow(null);
      return;
    }
    const key = modelSettingsKey(activeModelId);
    let cancelled = false;
    Promise.all([db.loadModelSettings(key), db.loadNativeContext(key)])
      .then(([saved, native]) => {
        if (!cancelled) setContextWindow(saved.nctx ?? native);
      })
      .catch(() => {
        if (!cancelled) setContextWindow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelId, models, serverStatus]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  if (!activeSession) return null;

  // The server's exact count of the last reply, plus an estimate for what came after it. Text files
  // are drawn in their own colour.
  const { total: usedTokens, fileTokens, exact } = contextUsageOf(activeSession.messages);
  const textTokens = usedTokens - fileTokens;
  const fileLine = fileTokens > 0 ? `${formatCount(fileTokens)} from attached files` : undefined;
  const hasWindow = contextWindow !== null && contextWindow > 0;
  const shown = `${exact ? "" : "~"}${formatCount(usedTokens)}`;

  return (
    <div className="chat-context-header__bar">
      {!serverStatus.running && <StatusBadge tone="red">Server Offline</StatusBadge>}
      <BodyStrong truncate title={activeSession.title} className="chat-context-header__title">
        {activeSession.title}
      </BodyStrong>
      <div className="chat-context-header__usage">
        {contextWindow && hasWindow ? (
          <ContextRing
            textPercent={(textTokens / contextWindow) * 100}
            filePercent={(fileTokens / contextWindow) * 100}
            label={`${shown} / ${formatCount(contextWindow)} tokens used`}
            fileLabel={fileLine}
          />
        ) : (
          <Meta>
            {[`${shown} tokens used`, activeModelId ? "window unknown" : undefined, fileLine]
              .filter(Boolean)
              .join(" · ")}
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
