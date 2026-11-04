import { PinRegular } from "@fluentui/react-icons";
import type { ChatSession } from "../../../../types";
import { messageCountLabel } from "../../../../utils/conversations";
import { formatRelativeDate } from "../../../../utils/format";
import { ItemRow } from "../../../ui/ItemRow/ItemRow";
import { ConversationMenu } from "../../ConversationMenu/ConversationMenu";
import "./ConversationRow.css";

interface ConversationRowProps {
  session: ChatSession;
  onOpen: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

/**
 * One conversation in the recent list: a card whose main part opens the chat, with the pin, title,
 * last update and message count, and the "…" menu at the right.
 */
export function ConversationRow({
  session,
  onOpen,
  onRename,
  onTogglePin,
  onDelete,
}: ConversationRowProps) {
  const count = messageCountLabel(session.messages);
  const updated = formatRelativeDate(session.updatedAt);
  const meta = updated ? `${updated} · ${count}` : count;

  return (
    <ItemRow
      title={session.title}
      detail={meta}
      icon={
        session.pinned ? (
          <span className="conversation-row__pin" title="Pinned">
            <PinRegular aria-hidden="true" />
          </span>
        ) : undefined
      }
      onOpen={onOpen}
      trailing={
        <ConversationMenu
          title={session.title}
          pinned={session.pinned}
          onRename={onRename}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
        />
      }
    />
  );
}
