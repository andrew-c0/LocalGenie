import { DeleteRegular, EditRegular, PinOffRegular, PinRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { ItemRowMenu, type ItemRowMenuItem } from "../../ui/ItemRowMenu/ItemRowMenu";

interface ConversationMenuProps {
  /** The conversation's title, named by the default button. */
  title: string;
  pinned: boolean;
  /** Adds Rename at the top. Left out where the caller already has a Rename button. */
  onRename?: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  /** A custom button that opens the menu. Omitted, the menu uses the "…" button. */
  trigger?: ReactElement;
}

/** The menu of one conversation: Rename (optional), Pin or Unpin, Delete. */
export function ConversationMenu({
  title,
  pinned,
  onRename,
  onTogglePin,
  onDelete,
  trigger,
}: ConversationMenuProps) {
  const items: ItemRowMenuItem[] = [
    ...(onRename ? [{ label: "Rename", icon: <EditRegular />, onClick: onRename }] : []),
    {
      label: pinned ? "Unpin" : "Pin",
      icon: pinned ? <PinOffRegular /> : <PinRegular />,
      onClick: onTogglePin,
    },
    { label: "Delete", icon: <DeleteRegular />, onClick: onDelete },
  ];
  return <ItemRowMenu name={title} items={items} trigger={trigger} />;
}
