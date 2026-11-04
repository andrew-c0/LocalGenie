import { Skeleton, SkeletonItem } from "@fluentui/react-components";
import "./Skeletons.css";

interface SkeletonBlockProps {
  /** Height in pixels. The block is full width. */
  height: number;
}

/** A placeholder box of a set height, for a card or a control that is loading. */
export function SkeletonBlock({ height }: SkeletonBlockProps) {
  return (
    <Skeleton aria-label="Loading" role="status" className="skeleton-block" style={{ height }}>
      <SkeletonItem className="skeleton-block__fill" />
    </Skeleton>
  );
}
