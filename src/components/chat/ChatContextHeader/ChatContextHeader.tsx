import { Badge, Toolbar, ToolbarButton, ToolbarDivider } from "@fluentui/react-components";
import { DismissRegular, EditRegular, SettingsRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { useModelStore } from "../../../stores/modelStore";
import { overrideCount } from "../../../utils/chatOverrides";
import { contextUsageOf } from "../../../utils/contextUsage";
import { formatCount } from "../../../utils/format";
import { modelSettingsKey } from "../../../utils/modelSettings";
import { RenameDialog } from "../../ui/RenameDialog/RenameDialog";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import { ChatSettingsDrawer } from "../ChatSettingsDrawer/ChatSettingsDrawer";
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
  const [renaming, setRenaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const customCount = overrideCount(activeSession.settingsOverrides);

  return (
    <div className="chat-context-header__bar">
      <BodyStrong truncate title={activeSession.title} className="chat-context-header__title">
        {activeSession.title}
      </BodyStrong>
      {customCount > 0 && (
        <Badge appearance="tint" color="brand" size="small">
          Custom settings
        </Badge>
      )}
      {settingsOpen && (
        <ChatSettingsDrawer sessionId={activeSession.id} onClose={() => setSettingsOpen(false)} />
      )}
      {renaming && (
        <RenameDialog
          title="Rename conversation"
          initialValue={activeSession.title}
          onSave={(title) => {
            useChatStore.getState().renameSession(activeSession.id, title);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
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
      <Toolbar aria-label="Conversation actions" className="chat-context-header__actions">
        <ToolbarButton
          icon={<EditRegular />}
          title="Rename conversation"
          aria-label="Rename conversation"
          onClick={() => setRenaming(true)}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={<SettingsRegular />}
          title="Chat settings"
          aria-label="Chat settings"
          onClick={() => setSettingsOpen(true)}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={<DismissRegular />}
          title="Close conversation"
          aria-label="Close conversation"
          onClick={() => navigate("/chat")}
        />
      </Toolbar>
    </div>
  );
}
