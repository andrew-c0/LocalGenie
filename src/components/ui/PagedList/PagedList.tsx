import { Fragment, type ReactNode, useState } from "react";
import { clampPage, pageOf } from "../../../utils/pagination";
import { Pager } from "../Pager/Pager";
import { SectionTitle } from "../Typography/Typography";
import "./PagedList.css";

const DEFAULT_PAGE_SIZE = 10;

interface PagedListProps<T> {
  /** The heading over the list, for example "Recent conversations". */
  title: string;
  /** Already in display order. */
  items: readonly T[];
  /** Items to a page. */
  pageSize?: number;
  /** Accessible name of the page controls. */
  ariaLabel: string;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}

/**
 * A titled list shown a page at a time, with the pager under it. Renders nothing when there are no items. The
 * caller orders the items and renders each row; the current page is kept here.
 */
export function PagedList<T>({
  title,
  items,
  pageSize = DEFAULT_PAGE_SIZE,
  ariaLabel,
  getKey,
  renderItem,
}: PagedListProps<T>) {
  const [page, setPage] = useState(1);
  if (items.length === 0) return null;

  const current = clampPage(page, items.length, pageSize);
  return (
    <section className="paged-list">
      <SectionTitle>{title}</SectionTitle>

      <div className="paged-list__rows">
        {pageOf(items, current, pageSize).map((item) => (
          <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </div>

      <Pager
        page={current}
        total={items.length}
        pageSize={pageSize}
        onPageChange={setPage}
        ariaLabel={ariaLabel}
      />
    </section>
  );
}
