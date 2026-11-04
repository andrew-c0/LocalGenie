import { Skeleton, SkeletonItem } from "@fluentui/react-components";
import { Flex } from "../Flex/Flex";
import "./Skeletons.css";

interface SkeletonLinesProps {
  /** How many lines of text to show. The last one is shorter, as a paragraph ends. */
  lines?: number;
}

/** Placeholder lines for running text, such as a README that is loading. */
export function SkeletonLines({ lines = 4 }: SkeletonLinesProps) {
  const count = Math.max(0, lines);
  const keys = Array.from({ length: count }, (_, index) => index);
  const shortIndex = count > 1 ? count - 1 : -1;

  return (
    <Skeleton aria-label="Loading" role="status">
      <Flex direction="column" gap="s">
        {keys.map((index) => (
          <div
            key={index}
            className={
              index === shortIndex
                ? "skeleton-lines__line skeleton-lines__line--short"
                : "skeleton-lines__line"
            }
          >
            <SkeletonItem size={14} />
          </div>
        ))}
      </Flex>
    </Skeleton>
  );
}
