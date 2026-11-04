import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionActions } from "../../../hooks/useSessionActions";
import { useChatStore } from "../../../stores/chatStore";
import type { ChatSession } from "../../../types";
import { pinnedFirst } from "../../../utils/conversations";
import { clampPage, pageOf } from "../../../utils/pagination";
import { Pager } from "../../ui/Pager/Pager";
import { RenameDialog } from "../../ui/RenameDialog/RenameDialog";
import { SectionTitle } from "../../ui/Typography/Typography";
import { DeleteConversationDialog } from "../DeleteConversationDialog/DeleteConversationDialog";
import { ConversationRow } from "./ConversationRow/ConversationRow";
import "./RecentConversations.css";

const PAGE_SIZE = 10;

/**
 * Every conversation on the chat landing: pinned first, then the store's order, 10 to a page. A row
 * opens the chat; its menu renames, pins or deletes it. Hidden when there are no conversations.
 */
export function RecentConversations() {
  const sessions = useChatStore((s) => s.sessions);
  const navigate = useNavigate();
  const actions = useSessionActions();
  const [page, setPage] = useState(1);
  const [renaming, setRenaming] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState<ChatSession | null>(null);

  if (sessions.length === 0) return null;

  const ordered = pinnedFirst(sessions);
  const current = clampPage(page, ordered.length, PAGE_SIZE);

  return (
    <section className="recent-conversations">
      <SectionTitle>Recent conversations</SectionTitle>

      <div className="recent-conversations__rows">
        {pageOf(ordered, current, PAGE_SIZE).map((session) => (
          <ConversationRow
            key={session.id}
            session={session}
            onOpen={() => navigate(`/chat/${session.id}`)}
            onRename={() => setRenaming(session)}
            onTogglePin={() => actions.togglePin(session)}
            onDelete={() => setDeleting(session)}
          />
        ))}
      </div>

      <Pager
        page={current}
        total={ordered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        ariaLabel="Recent conversation pages"
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
    </section>
  );
}
