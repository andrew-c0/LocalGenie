import { ChevronRightRegular, WarningRegular } from "@fluentui/react-icons";
import type { RouteMeta } from "../../../../navigation/routes";
import { Flex } from "../../Flex/Flex";
import { BodyStrong, Meta } from "../../Typography/Typography";
import "./SectionRouteCard.css";

interface SectionRouteCardProps {
  route: RouteMeta;
  /** A live line on the right of the row, for example "3 installed". */
  fact?: string;
  /** Marks the fact as a warning: it is tinted and led by a warning icon. */
  warning?: boolean;
  /** Why the sub-page is locked (its runtime is missing). Null when it is open. */
  lockedReason: string | null;
  onOpen: () => void;
}

/**
 * One sub-page row on a section landing. The whole row is the button: icon, title with the
 * description beneath, the live fact and a chevron. A locked row is disabled and shows the reason
 * in place of the description.
 */
export function SectionRouteCard({
  route,
  fact,
  warning = false,
  lockedReason,
  onOpen,
}: SectionRouteCardProps) {
  return (
    <button
      type="button"
      className="section-route-card"
      disabled={lockedReason !== null}
      onClick={onOpen}
    >
      <Flex align="center" gap="l">
        <span className="section-route-card__icon">{route.icon}</span>
        <Flex direction="column" gap="xxs" grow className="section-route-card__text">
          <BodyStrong as="span" truncate>
            {route.title}
          </BodyStrong>
          <Meta as="span" truncate className="section-route-card__description">
            {lockedReason ?? route.description}
          </Meta>
        </Flex>
        {fact && (
          <Meta
            as="span"
            className={
              warning
                ? "section-route-card__fact section-route-card__fact--warning"
                : "section-route-card__fact"
            }
          >
            {warning && (
              <WarningRegular className="section-route-card__warning-icon" aria-hidden="true" />
            )}
            {fact}
          </Meta>
        )}
        <ChevronRightRegular className="section-route-card__chevron" aria-hidden="true" />
      </Flex>
    </button>
  );
}
