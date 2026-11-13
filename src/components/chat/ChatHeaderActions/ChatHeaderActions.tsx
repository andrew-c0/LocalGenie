import { CounterBadge, Toolbar, ToolbarButton, ToolbarDivider } from "@fluentui/react-components";
import {
  ArrowSyncRegular,
  EditRegular,
  MoreHorizontalRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useCompactNow } from "../../../hooks/useCompactNow";
import { useContextWindow } from "../../../hooks/useContextWindow";
import { useSessionActions } from "../../../hooks/useSessionActions";
import { useModelStore } from "../../../stores/modelStore";
import type { ChatSession } from "../../../types";
import { overrideCount } from "../../../utils/chatOverrides";
import { contextUsageOf } from "../../../utils/contextUsage";
import { formatCount } from "../../../utils/format";
import { BreadcrumbActions } from "../../ui/Breadcrumbs/BreadcrumbActions";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { RenameDialog } from "../../ui/RenameDialog/RenameDialog";
import { Meta } from "../../ui/Typography/Typography";
import { ChatSettingsDrawer } from "../ChatSettingsDrawer/ChatSettingsDrawer";
import { ContextRing } from "../ContextRing/ContextRing";
import { ConversationMenu } from "../ConversationMenu/ConversationMenu";
import { DeleteConversationDialog } from "../DeleteConversationDialog/DeleteConversationDialog";
import "./ChatHeaderActions.css";

interface ChatHeaderActionsProps {
  session: ChatSession;
}

/**
 * The open conversation's controls, shown at the end of the breadcrumb row: context usage against the
 * model's window, then Compact now, rename, chat settings and the conversation menu. The dialogs and the
 * settings drawer sit outside the portal, since they portal themselves and keep their state here.
 */
export function ChatHeaderActions({ session }: ChatHeaderActionsProps) {
  const actions = useSessionActions();
  const activeModelId = useModelStore((s) => s.activeModelId);
  const contextWindow = useContextWindow();
  const compactNow = useCompactNow(session);
  const [renaming, setRenaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingCompact, setConfirmingCompact] = useState(false);

  // An estimate of what the next request carries. Text files are drawn in their own colour.
  const { total: usedTokens, fileTokens } = contextUsageOf(session.messages);
  const textTokens = usedTokens - fileTokens;
  const fileLine = fileTokens > 0 ? `${formatCount(fileTokens)} from attached files` : undefined;
  const windowTokens = contextWindow !== null && contextWindow > 0 ? contextWindow : null;
  const shown = `~${formatCount(usedTokens)}`;
  const customCount = overrideCount(session.settingsOverrides);

  return (
    <>
      <BreadcrumbActions>
        <div className="chat-header-actions">
          {windowTokens !== null ? (
            <ContextRing
              textPercent={(textTokens / windowTokens) * 100}
              filePercent={(fileTokens / windowTokens) * 100}
              label={`${shown} / ${formatCount(windowTokens)} tokens used`}
              fileLabel={fileLine}
            />
          ) : (
            <Meta>
              {[`${shown} tokens used`, activeModelId ? "window unknown" : undefined, fileLine]
                .filter(Boolean)
                .join(" · ")}
            </Meta>
          )}
          <Toolbar aria-label="Conversation actions">
            <ToolbarButton
              icon={<ArrowSyncRegular />}
              title={compactNow.blocker ?? "Compact now"}
              aria-label="Compact now"
              disabled={compactNow.blocker !== null}
              onClick={() => setConfirmingCompact(true)}
            />
            <ToolbarDivider />
            <ToolbarButton
              icon={<EditRegular />}
              title="Rename conversation"
              aria-label="Rename conversation"
              onClick={() => setRenaming(true)}
            />
            <ToolbarDivider />
            <ToolbarButton
              icon={
                <span className="chat-header-actions__settings-icon">
                  <SettingsRegular />
                  {customCount > 0 && (
                    <span className="chat-header-actions__count">
                      <CounterBadge count={customCount} size="tiny" color="brand" />
                    </span>
                  )}
                </span>
              }
              title={customCount > 0 ? `Chat settings (${customCount} custom)` : "Chat settings"}
              aria-label="Chat settings"
              onClick={() => setSettingsOpen(true)}
            />
            <ToolbarDivider />
            <ConversationMenu
              title={session.title}
              pinned={session.pinned}
              onTogglePin={() => actions.togglePin(session)}
              onDelete={() => setConfirmingDelete(true)}
              trigger={
                <ToolbarButton
                  icon={<MoreHorizontalRegular />}
                  title="More conversation actions"
                  aria-label="More conversation actions"
                />
              }
            />
          </Toolbar>
        </div>
      </BreadcrumbActions>
      {settingsOpen && (
        <ChatSettingsDrawer sessionId={session.id} onClose={() => setSettingsOpen(false)} />
      )}
      {renaming && (
        <RenameDialog
          title="Rename conversation"
          initialValue={session.title}
          onSave={(title) => {
            actions.rename(session.id, title);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
      {confirmingCompact && (
        <ConfirmDialog
          title="Compact this conversation now?"
          message="The earlier messages are replaced by a summary for the model. The summary is written now, with the loaded model. This is permanent: it cannot be undone, and the covered messages cannot be deleted or retried."
          confirmLabel="Compact"
          onConfirm={() => {
            setConfirmingCompact(false);
            compactNow.compact();
          }}
          onCancel={() => setConfirmingCompact(false)}
        />
      )}
      {confirmingDelete && (
        <DeleteConversationDialog
          title={session.title}
          onConfirm={() => {
            setConfirmingDelete(false);
            actions.remove(session.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
