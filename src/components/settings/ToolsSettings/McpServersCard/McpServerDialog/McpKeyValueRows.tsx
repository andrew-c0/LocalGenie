import { Button, Input } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import type { KeyValueRow } from "../../../../../utils/mcpServers";
import { ErrorBanner } from "../../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../../ui/Flex/Flex";
import { BodyStrong } from "../../../../ui/Typography/Typography";

interface McpKeyValueRowsProps {
  /** The list's heading, for example "Environment variables". */
  label: string;
  rows: KeyValueRow[];
  /** Accessible names of the two inputs of each row. */
  keyLabel: string;
  valueLabel: string;
  addLabel: string;
  /** A problem with the rows, shown under them. */
  error?: string;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<Pick<KeyValueRow, "key" | "value">>) => void;
  onRemove: (id: string) => void;
}

/** An editable list of name and value pairs: environment variables or headers. */
export function McpKeyValueRows({
  label,
  rows,
  keyLabel,
  valueLabel,
  addLabel,
  error,
  onAdd,
  onChange,
  onRemove,
}: McpKeyValueRowsProps) {
  return (
    <Flex direction="column" gap="s">
      <BodyStrong>{label}</BodyStrong>
      {rows.map((row) => (
        <Flex key={row.id} align="center" gap="s">
          <div className="flex-grow mcp-dialog__row-field">
            <Input
              aria-label={keyLabel}
              placeholder={keyLabel}
              value={row.key}
              onChange={(_, data) => onChange(row.id, { key: data.value })}
            />
          </div>
          <div className="flex-grow mcp-dialog__row-field">
            <Input
              aria-label={valueLabel}
              placeholder={valueLabel}
              value={row.value}
              onChange={(_, data) => onChange(row.id, { value: data.value })}
            />
          </div>
          <Button
            size="small"
            appearance="secondary"
            icon={<DeleteRegular />}
            aria-label={`Remove this ${keyLabel.toLowerCase()}`}
            onClick={() => onRemove(row.id)}
          />
        </Flex>
      ))}
      {error && <ErrorBanner message={error} />}
      <div>
        <Button size="small" appearance="secondary" icon={<AddRegular />} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
    </Flex>
  );
}
