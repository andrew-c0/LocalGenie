import { Button, Card } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { Flex } from "../../ui/Flex/Flex";
import { ModelFileLine, type ModelFileRow } from "./ModelFileLine";
import "./ModelFilesCard.css";

interface ModelFilesCardProps {
  rows: ModelFileRow[];
}

/**
 * The files of a model behind a collapsed "Files (n)" toggle, each with its size and source link when it
 * has one. Shared by the Hugging Face and Playground model pages. Renders nothing with no files.
 */
export function ModelFilesCard({ rows }: ModelFilesCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <Card size="small">
      <Flex direction="column" gap="s">
        <Flex direction="column" align="start">
          <Button
            appearance="secondary"
            icon={isOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((wasOpen) => !wasOpen)}
          >
            Files ({rows.length})
          </Button>
        </Flex>
        {isOpen && rows.map((row) => <ModelFileLine key={row.key} row={row} />)}
      </Flex>
    </Card>
  );
}
