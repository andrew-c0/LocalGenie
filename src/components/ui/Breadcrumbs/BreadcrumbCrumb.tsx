import { BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem } from "@fluentui/react-components";

interface BreadcrumbCrumbProps {
  label: string;
  isCurrent: boolean;
  /** A divider comes before every crumb but the first. */
  showDivider: boolean;
  onOpen: () => void;
}

/** One crumb of the trail: a link up the tree, or the current page (not a link). */
export function BreadcrumbCrumb({ label, isCurrent, showDivider, onOpen }: BreadcrumbCrumbProps) {
  // The label is its own span so the last crumb can truncate with an ellipsis.
  const text = <span className="breadcrumbs__crumb-label">{label}</span>;
  return (
    <>
      {showDivider && <BreadcrumbDivider />}
      <BreadcrumbItem>
        {isCurrent ? (
          <BreadcrumbButton current>{text}</BreadcrumbButton>
        ) : (
          <BreadcrumbButton onClick={onOpen}>{text}</BreadcrumbButton>
        )}
      </BreadcrumbItem>
    </>
  );
}
