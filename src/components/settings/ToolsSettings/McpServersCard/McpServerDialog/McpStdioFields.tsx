import { Field, Input, MessageBar, MessageBarBody, Textarea } from "@fluentui/react-components";
import type { McpDraftErrors } from "../../../../../utils/mcpServers";
import { commandLineOf, parseArgs, STDIO_WARNING } from "../../../../../utils/mcpServers";
import { Flex } from "../../../../ui/Flex/Flex";
import { Meta } from "../../../../ui/Typography/Typography";
import { McpKeyValueRows } from "./McpKeyValueRows";
import type { McpDraftForm } from "./useMcpDraft";

interface McpStdioFieldsProps {
  form: McpDraftForm;
  errors: McpDraftErrors;
}

/**
 * The fields of a stdio server: the warning, the program, its arguments, the environment variables and
 * the exact command line that will run.
 */
export function McpStdioFields({ form, errors }: McpStdioFieldsProps) {
  const { draft, setField, addRowTo, changeRowIn, removeRowFrom } = form;
  const commandLine = commandLineOf(draft.command, parseArgs(draft.argsText));

  return (
    <Flex direction="column" gap="m">
      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>{STDIO_WARNING}</MessageBarBody>
      </MessageBar>

      <Field
        label="Command"
        hint="The program to run, for example npx, uvx or the full path to a program."
        required
        validationState={errors.command ? "error" : "none"}
        validationMessage={errors.command}
      >
        <Input value={draft.command} onChange={(_, data) => setField("command", data.value)} />
      </Field>

      <Field label="Arguments" hint="One argument per line.">
        <Textarea
          rows={3}
          resize="vertical"
          value={draft.argsText}
          onChange={(_, data) => setField("argsText", data.value)}
        />
      </Field>

      <McpKeyValueRows
        label="Environment variables"
        rows={draft.env}
        keyLabel="Variable name"
        valueLabel="Value"
        addLabel="Add variable"
        error={errors.env}
        onAdd={() => addRowTo("env")}
        onChange={(id, patch) => changeRowIn("env", id, patch)}
        onRemove={(id) => removeRowFrom("env", id)}
      />

      <Flex direction="column" gap="xs">
        <Meta>Command line that will run</Meta>
        <code className="mcp-dialog__command">
          {commandLine || "Enter a command to see the command line."}
        </code>
      </Flex>
    </Flex>
  );
}
