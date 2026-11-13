import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Radio,
  RadioGroup,
} from "@fluentui/react-components";
import { useState } from "react";
import { useMcpStore } from "../../../../../stores/mcpStore";
import type { McpServerConfig } from "../../../../../types";
import { errorMessage } from "../../../../../utils/errorMessage";
import {
  configFromDraft,
  hasDraftErrors,
  type McpDraftErrors,
  PLAIN_TEXT_NOTE,
  validateDraft,
} from "../../../../../utils/mcpServers";
import { ErrorBanner } from "../../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../../ui/Flex/Flex";
import { Meta } from "../../../../ui/Typography/Typography";
import { McpHttpFields } from "./McpHttpFields";
import { McpStdioFields } from "./McpStdioFields";
import "./McpServerDialog.css";
import { useMcpDraft } from "./useMcpDraft";

interface McpServerDialogProps {
  /** The server being edited, or null for a new one. */
  config: McpServerConfig | null;
  onClose: () => void;
}

/**
 * Adds or edits an MCP server. The problems of the form show after the first Save. A save that the
 * backend refuses keeps the form open with its reason. Nothing starts until the server is saved.
 */
export function McpServerDialog({ config, onClose }: McpServerDialogProps) {
  const form = useMcpDraft(config);
  const save = useMcpStore((s) => s.save);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { draft, setField, setTransport } = form;
  const errors = validateDraft(draft);
  const shownErrors: McpDraftErrors = submitted ? errors : {};

  const handleSave = async () => {
    setSubmitted(true);
    if (hasDraftErrors(errors)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save(configFromDraft(draft, config?.id ?? "", config?.enabled ?? true));
      onClose();
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !saving) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{config ? "Edit MCP server" : "Add MCP server"}</DialogTitle>
          <DialogContent>
            <Flex direction="column" gap="m" className="mcp-dialog__form">
              <Field
                label="Name"
                required
                validationState={shownErrors.name ? "error" : "none"}
                validationMessage={shownErrors.name}
              >
                <Input value={draft.name} onChange={(_, data) => setField("name", data.value)} />
              </Field>

              <Field label="Transport">
                <RadioGroup
                  layout="horizontal"
                  value={draft.transport}
                  onChange={(_, data) => setTransport(data.value === "http" ? "http" : "stdio")}
                >
                  <Radio value="stdio" label="Program on this computer (stdio)" />
                  <Radio value="http" label="Web address (HTTP)" />
                </RadioGroup>
              </Field>

              {draft.transport === "stdio" ? (
                <McpStdioFields form={form} errors={shownErrors} />
              ) : (
                <McpHttpFields form={form} errors={shownErrors} />
              )}

              <Meta>{PLAIN_TEXT_NOTE}</Meta>
              {saveError && <ErrorBanner message={saveError} />}
            </Flex>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button appearance="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
