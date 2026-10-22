import type { ElementType, HTMLAttributes, ReactNode } from "react";
import "./Flex.css";

export type FlexGap = "none" | "xxs" | "xs" | "s" | "m" | "l" | "xl";

interface FlexProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  direction?: "row" | "column";
  /** Space between children, from the Fluent spacing tokens. */
  gap?: FlexGap;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  /** Fill the space the parent gives this element (flex: 1). */
  grow?: boolean;
  children?: ReactNode;
}

/**
 * Flexbox container. Fluent has no layout primitives, so spacing and alignment come from these
 * props rather than per-component CSS. For one child that should take the remaining space, add
 * the `flex-grow` class to that child.
 */
export function Flex({
  as: Tag = "div",
  direction = "row",
  gap = "none",
  align,
  justify,
  wrap,
  grow,
  className,
  ...rest
}: FlexProps) {
  const classes = [
    "flex",
    `flex--${direction}`,
    `flex--gap-${gap}`,
    align && `flex--align-${align}`,
    justify && `flex--justify-${justify}`,
    wrap && "flex--wrap",
    grow && "flex--grow",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <Tag className={classes} {...rest} />;
}
