import { Button } from "@fluentui/react-components";
import { ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { clampPage, pageCountOf, rangeLabelOf } from "../../../utils/pagination";
import { Flex } from "../Flex/Flex";
import { Meta } from "../Typography/Typography";
import "./Pager.css";

interface PagerProps {
  /** The current page, 1-based. A page past the end is clamped to the last one. */
  page: number;
  /** Items across all pages. */
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Accessible name of the page controls, for example "Recent conversation pages". */
  ariaLabel?: string;
}

/**
 * Range and Previous / Next under a list, aligned to the right. Renders nothing when the items fit
 * on one page. Stateless: the parent keeps the page and passes it back in.
 */
export function Pager({ page, total, pageSize, onPageChange, ariaLabel = "Pages" }: PagerProps) {
  if (pageCountOf(total, pageSize) <= 1) return null;

  const current = clampPage(page, total, pageSize);
  const pageCount = pageCountOf(total, pageSize);

  return (
    <Flex as="nav" aria-label={ariaLabel} align="center" justify="end" gap="s">
      <Meta className="pager__range" aria-live="polite">
        {rangeLabelOf(total, current, pageSize)}
      </Meta>
      <Button
        appearance="secondary"
        icon={<ChevronLeftRegular />}
        aria-label="Previous page"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        Previous
      </Button>
      <Button
        appearance="secondary"
        icon={<ChevronRightRegular />}
        iconPosition="after"
        aria-label="Next page"
        disabled={current >= pageCount}
        onClick={() => onPageChange(current + 1)}
      >
        Next
      </Button>
    </Flex>
  );
}
