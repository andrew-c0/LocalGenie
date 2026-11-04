import { Button, Spinner } from "@fluentui/react-components";
import { ChevronRightRegular } from "@fluentui/react-icons";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { ItemRow } from "../../ui/ItemRow/ItemRow";
import { ItemRowMenu, type ItemRowMenuItem } from "../../ui/ItemRowMenu/ItemRowMenu";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import "./BenchmarkList.css";

interface BenchmarkListItem {
  id: string;
  name: string;
}

interface BenchmarkListProps<T extends BenchmarkListItem> {
  /** Null while loading. */
  items: T[] | null;
  error: string | null;
  emptyMessage: string;
  detailOf: (item: T) => string;
  /** Opens the item's page. Called by the row's click. */
  onOpen: (item: T) => void;
  /** The row's menu actions. Left out, the row ends in a chevron: it only opens. */
  actionsOf?: (item: T) => ItemRowMenuItem[];
  onRetry: () => void;
}

/**
 * A full-width list of saved benchmark items as card rows, with the loading, empty and error states.
 * The page above the list carries the title and any New button.
 */
export function BenchmarkList<T extends BenchmarkListItem>({
  items,
  error,
  emptyMessage,
  detailOf,
  onOpen,
  actionsOf,
  onRetry,
}: BenchmarkListProps<T>) {
  return (
    <Flex direction="column" gap="s">
      {error && (
        <>
          <ErrorBanner message={error} />
          <Button appearance="secondary" onClick={onRetry}>
            Try again
          </Button>
        </>
      )}

      {!error && items === null && (
        <div className="benchmark-list__loading">
          <Spinner size="tiny" label="Loading" />
        </div>
      )}

      {items !== null && items.length === 0 && <StateBlock message={emptyMessage} />}

      {items !== null && items.length > 0 && (
        <Flex as="ul" direction="column" gap="s" className="benchmark-list__items">
          {items.map((item) => (
            <li key={item.id}>
              <ItemRow
                title={item.name}
                detail={detailOf(item)}
                onOpen={() => onOpen(item)}
                trailing={
                  actionsOf ? (
                    <ItemRowMenu name={item.name} items={actionsOf(item)} />
                  ) : (
                    <ChevronRightRegular aria-hidden="true" />
                  )
                }
              />
            </li>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
