import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionActions } from "../../../hooks/useSessionActions";
import { useChatStore } from "../../../stores/chatStore";
import type { ChatSession } from "../../../types";
import { chatSessionsOf, pinnedFirst } from "../../../utils/conversations";
import { PagedList } from "../../ui/PagedList/PagedList";
import { RenameDialog } from "../../ui/RenameDialog/RenameDialog";
import { DeleteConversationDialog } from "../DeleteConversationDialog/DeleteConversationDialog";
import { ConversationRow } from "./ConversationRow/ConversationRow";

/**
 * Every conversation on the chat landing: pinned first, then the store's order, 10 to a page. A row
 * opens the chat; its menu renames, pins or deletes it. Hidden when there are no conversations.
 */
export function RecentConversations() {
  const allSessions = useChatStore((s) => s.sessions);
  const sessions = chatSessionsOf(allSessions);
  const navigate = useNavigate();
  const actions = useSessionActions();
  const [renaming, setRenaming] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState<ChatSession | null>(null);

  return (
    <>
      <PagedList
        title="Recent conversations"
        items={pinnedFirst(sessions)}
        ariaLabel="Recent conversation pages"
        getKey={(session) => session.id}
        renderItem={(session) => (
          <ConversationRow
            session={session}
            onOpen={() => navigate(`/chat/${session.id}`)}
            onRename={() => setRenaming(session)}
            onTogglePin={() => actions.togglePin(session)}
            onDelete={() => setDeleting(session)}
          />
        )}
      />

      {renaming && (
        <RenameDialog
          title="Rename conversation"
          initialValue={renaming.title}
          onSave={(title) => {
            actions.rename(renaming.id, title);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}

      {deleting && (
        <DeleteConversationDialog
          title={deleting.title}
          onConfirm={() => {
            actions.remove(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
