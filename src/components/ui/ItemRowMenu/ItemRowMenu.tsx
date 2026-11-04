import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from "@fluentui/react-components";
import { MoreHorizontalRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import "./ItemRowMenu.css";

export interface ItemRowMenuItem {
  label: string;
  icon?: ReactElement;
  onClick: () => void;
  /** Shown in the danger colour. Used for Delete. */
  danger?: boolean;
  /** Shown but not clickable, e.g. Delete while a job uses the model. */
  disabled?: boolean;
}

interface ItemRowMenuProps {
  /** Names the item in the default button's label: "More actions for <name>". */
  name: string;
  items: ItemRowMenuItem[];
  /** A custom button that opens the menu. It brings its own label; the default is the "…" button. */
  trigger?: ReactElement;
}

/** The "…" menu of one list item. The menu sits in a portal, so it can sit anywhere in a row. */
export function ItemRowMenu({ name, items, trigger }: ItemRowMenuProps) {
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        {trigger ?? (
          <Button
            appearance="subtle"
            icon={<MoreHorizontalRegular />}
            aria-label={`More actions for ${name}`}
          />
        )}
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {items.map((item) => (
            <MenuItem
              key={item.label}
              icon={item.icon}
              disabled={item.disabled}
              onClick={item.onClick}
              className={
                item.danger ? "item-row-menu__item item-row-menu__item--danger" : undefined
              }
            >
              {item.label}
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
