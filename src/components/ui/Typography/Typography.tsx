import {
  Body1,
  Body1Strong,
  Caption1,
  Caption1Strong,
  Subtitle1,
  Subtitle2,
  Title2,
  Title3,
} from "@fluentui/react-components";
import type { ComponentProps } from "react";
import "./Typography.css";

/**
 * The app's text scale. Use these instead of picking Fluent text components and weights per screen.
 *
 *   Eyebrow       Caption1Strong  small uppercase label above a page title
 *   PageTitle     Title2          one per page, the h1
 *   SectionTitle  Subtitle1       a group of content inside a page (h2)
 *   CardTitle     Subtitle2       a card or list item title (h3)
 *   Body          Body1           default running text
 *   BodyStrong    Body1Strong     emphasised running text, list labels
 *   Secondary     Body1           supporting text under a title, muted colour
 *   Meta          Caption1        labels, hints, sizes, timestamps
 *   Metric        Title3          a single headline value in a stat card
 */
export function Eyebrow(props: ComponentProps<typeof Caption1Strong>) {
  return <Caption1Strong block {...props} />;
}

export function PageTitle(props: ComponentProps<typeof Title2>) {
  return <Title2 as="h1" block {...props} />;
}

export function SectionTitle(props: ComponentProps<typeof Subtitle1>) {
  return <Subtitle1 as="h2" block {...props} />;
}

export function CardTitle(props: ComponentProps<typeof Subtitle2>) {
  return <Subtitle2 as="h3" block {...props} />;
}

export function Body(props: ComponentProps<typeof Body1>) {
  return <Body1 block {...props} />;
}

export function BodyStrong(props: ComponentProps<typeof Body1Strong>) {
  return <Body1Strong block {...props} />;
}

export function Secondary({ className, ...props }: ComponentProps<typeof Body1>) {
  return (
    <Body1
      block
      className={className ? `typography-secondary ${className}` : "typography-secondary"}
      {...props}
    />
  );
}

export function Meta(props: ComponentProps<typeof Caption1>) {
  return <Caption1 {...props} />;
}

export function Metric(props: ComponentProps<typeof Title3>) {
  return <Title3 {...props} />;
}
