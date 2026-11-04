import type { ReactNode } from "react";
import { Flex } from "../Flex/Flex";
import { BodyStrong, Meta } from "../Typography/Typography";
import "./ItemRow.css";

interface ItemRowProps {
  title: string;
  /** One muted line under the title. */
  detail?: string;
  /** Leading icon, inside the open button. */
  icon?: ReactNode;
  /** Muted text at the right of the open button, for example "3 installed". */
  fact?: string;
  onOpen: () => void;
  /** Right of the row, outside the open button: an overflow menu or a chevron. */
  trailing?: ReactNode;
}

/**
 * One item in a list of cards. The open part is a single button (focusable, with hover and focus
 * styles) that carries the icon, title and detail; the trailing slot sits beside it as its own control.
 */
export function ItemRow({ title, detail, icon, fact, onOpen, trailing }: ItemRowProps) {
  return (
    <div className="item-row">
      <button type="button" className="item-row__open" onClick={onOpen}>
        <Flex align="center" gap="s">
          {icon && <span className="item-row__icon">{icon}</span>}
          <Flex direction="column" gap="xxs" grow className="item-row__text">
            <BodyStrong as="span" truncate title={title}>
              {title}
            </BodyStrong>
            {detail && (
              <Meta as="span" truncate className="item-row__detail">
                {detail}
              </Meta>
            )}
          </Flex>
          {fact && (
            <Meta as="span" className="item-row__fact">
              {fact}
            </Meta>
          )}
        </Flex>
      </button>
      {trailing && <div className="item-row__trailing">{trailing}</div>}
    </div>
  );
}
