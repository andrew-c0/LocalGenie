import {
  Button,
  Caption1,
  Card,
  Field,
  Input,
  SpinButton,
  Spinner,
  Subtitle1,
  Toast,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import * as db from "../../../services/database";
import type { ServerSettings } from "../../../types";
import { DEFAULT_SERVER_SETTINGS } from "../../../utils/modelSettings";
import "./ServerRuntimeCard.css";

/** Edits the settings the GenieX server starts with: allowed CORS origins and the keepalive timeout. */
export default function ServerRuntimeCard() {
  const { dispatchToast } = useToastController("app-toaster");
  const [saved, setSaved] = useState<ServerSettings>(DEFAULT_SERVER_SETTINGS);
  const [draft, setDraft] = useState<ServerSettings>(DEFAULT_SERVER_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.getServerSettings()
      .then((settings) => {
        setSaved(settings);
        setDraft(settings);
      })
      .catch(() => {});
  }, []);

  const dirty = draft.origins !== saved.origins || draft.keepalive !== saved.keepalive;

  const handleSave = async () => {
    const origins = draft.origins.trim();
    if (!origins) {
      setError("Enter * or at least one origin.");
      return;
    }
    if (!Number.isInteger(draft.keepalive) || draft.keepalive < 0) {
      setError("Keepalive must be 0 seconds or more.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next: ServerSettings = { origins, keepalive: draft.keepalive };
      await db.saveServerSettings(next);
      setSaved(next);
      setDraft(next);
      dispatchToast(
        <Toast>
          <ToastTitle>Server settings saved</ToastTitle>
        </Toast>,
        { intent: "success" },
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="server-runtime-card__stack">
        <Subtitle1>Server runtime</Subtitle1>
        <Field
          label="Allowed origins"
          hint="Web origins allowed to call the server (CORS). * allows any origin."
          validationState={error ? "error" : "none"}
          validationMessage={error ?? undefined}
        >
          <Input
            value={draft.origins}
            onChange={(_, data) => setDraft({ ...draft, origins: data.value })}
          />
        </Field>
        <Field
          label="Keepalive (seconds)"
          hint="Seconds the server keeps running without requests before it shuts down. 0 disables the timeout."
        >
          <SpinButton
            value={draft.keepalive}
            min={0}
            max={86400}
            step={30}
            onChange={(_, data) => {
              if (data.value != null) setDraft({ ...draft, keepalive: data.value });
            }}
          />
        </Field>
        <Caption1>
          Applied when the server starts. If these change, the server restarts on the next model
          load.
        </Caption1>
        <div className="server-runtime-card__actions">
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
