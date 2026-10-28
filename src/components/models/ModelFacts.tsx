import type { ReactNode } from "react";
import { Flex } from "../ui/Flex/Flex";
import { Body, Meta } from "../ui/Typography/Typography";

/** One labelled fact of a model. A missing value (null, undefined or empty) is shown as `N/A`. */
export interface ModelFact {
  label: string;
  value: ReactNode;
  /** Hover text for the value. */
  title?: string;
}

/** The facts of a model, one labelled value each. Every source's detail page shows them this way. */
export function ModelFacts({ facts }: { facts: ModelFact[] }) {
  return (
    <Flex gap="l" wrap>
      {facts.map(({ label, value, title }) => {
        const missing = value === null || value === undefined || value === "";
        return (
          <Flex key={label} direction="column" gap="xxs">
            <Meta>{label}</Meta>
            <Body title={title}>{missing ? "N/A" : value}</Body>
          </Flex>
        );
      })}
    </Flex>
  );
}
