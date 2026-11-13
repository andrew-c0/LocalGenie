import { Field, Input } from "@fluentui/react-components";
import type { McpDraftErrors } from "../../../../../utils/mcpServers";
import { Flex } from "../../../../ui/Flex/Flex";
import { McpKeyValueRows } from "./McpKeyValueRows";
import type { McpDraftForm } from "./useMcpDraft";

interface McpHttpFieldsProps {
  form: McpDraftForm;
  errors: McpDraftErrors;
}

/** The fields of an HTTP server: its address and the headers sent with each request. */
export function McpHttpFields({ form, errors }: McpHttpFieldsProps) {
  const { draft, setField, addRowTo, changeRowIn, removeRowFrom } = form;

  return (
    <Flex direction="column" gap="m">
      <Field
        label="Address"
        hint="The server's full address, starting with http:// or https://."
        required
        validationState={errors.url ? "error" : "none"}
        validationMessage={errors.url}
      >
        <Input
          placeholder="https://example.com/mcp"
          value={draft.url}
          onChange={(_, data) => setField("url", data.value)}
        />
      </Field>

      <McpKeyValueRows
        label="Headers"
        rows={draft.headers}
        keyLabel="Header name"
        valueLabel="Value"
        addLabel="Add header"
        error={errors.headers}
        onAdd={() => addRowTo("headers")}
        onChange={(id, patch) => changeRowIn("headers", id, patch)}
        onRemove={(id) => removeRowFrom("headers", id)}
      />
    </Flex>
  );
}
