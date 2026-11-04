import { Card } from "@fluentui/react-components";
import type { ReactNode } from "react";
import type { SpecCell } from "../../../utils/modelSpecs";
import { ExternalLink } from "../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../ui/Flex/Flex";
import { Body, CardTitle, Meta } from "../../ui/Typography/Typography";
import "./ModelSpecSection.css";

interface ModelSpecSectionProps {
  title: string;
  /** Label and value cells. A cell with no value is not shown. */
  cells?: SpecCell[];
  /** Content above the cells: a line of text, a list, badges. */
  children?: ReactNode;
}

/**
 * A titled card of label and value cells, shared by the model detail pages. Renders nothing when it
 * has no cell with a value and no content.
 */
export function ModelSpecSection({ title, cells = [], children }: ModelSpecSectionProps) {
  const shown = cells.filter((cell) => cell.value);
  if (shown.length === 0 && !children) return null;

  return (
    <Card size="small">
      <Flex direction="column" gap="s">
        <CardTitle>{title}</CardTitle>
        {children}
        {shown.length > 0 && (
          <div className="model-spec-section__grid">
            {shown.map((cell) => (
              <div key={cell.label} className="model-spec-section__cell">
                <Meta>{cell.label}</Meta>
                {cell.href ? (
                  <ExternalLink url={cell.href}>{cell.value ?? ""}</ExternalLink>
                ) : (
                  <Body>{cell.value}</Body>
                )}
              </div>
            ))}
          </div>
        )}
      </Flex>
    </Card>
  );
}
