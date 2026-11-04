import { Card, Skeleton, SkeletonItem } from "@fluentui/react-components";
import { Flex } from "../Flex/Flex";
import "./Skeletons.css";

interface SkeletonRowsProps {
  /** How many placeholder rows to show. */
  count?: number;
  /**
   * "row" matches an ItemRow (leading circle, title, detail, trailing pill). "card" matches a
   * ModelCard (title with a pill, then a line of facts).
   */
  variant?: "row" | "card";
}

/** Placeholder rows for a list that is loading. The shapes follow the row or card they stand for. */
export function SkeletonRows({ count = 3, variant = "row" }: SkeletonRowsProps) {
  const keys = Array.from({ length: Math.max(0, count) }, (_, index) => index);

  return (
    <Skeleton aria-label="Loading" role="status">
      <Flex direction="column" gap="s">
        {keys.map((index) =>
          variant === "card" ? (
            <Card key={index} size="small">
              <Flex align="center" justify="between" gap="s">
                <div className="skeleton-rows__title">
                  <SkeletonItem size={16} />
                </div>
                <div className="skeleton-rows__pill">
                  <SkeletonItem size={24} />
                </div>
              </Flex>
              <Flex align="center" gap="m">
                <div className="skeleton-rows__fact skeleton-rows__fact--short">
                  <SkeletonItem size={12} />
                </div>
                <div className="skeleton-rows__fact">
                  <SkeletonItem size={12} />
                </div>
                <div className="skeleton-rows__fact skeleton-rows__fact--short">
                  <SkeletonItem size={12} />
                </div>
              </Flex>
            </Card>
          ) : (
            <div key={index} className="skeleton-rows__item">
              <SkeletonItem shape="circle" size={32} className="skeleton-rows__lead" />
              <Flex direction="column" gap="xxs" grow className="skeleton-rows__text">
                <div className="skeleton-rows__title">
                  <SkeletonItem size={16} />
                </div>
                <div className="skeleton-rows__detail">
                  <SkeletonItem size={12} />
                </div>
              </Flex>
              <div className="skeleton-rows__pill">
                <SkeletonItem size={24} />
              </div>
            </div>
          ),
        )}
      </Flex>
    </Skeleton>
  );
}
