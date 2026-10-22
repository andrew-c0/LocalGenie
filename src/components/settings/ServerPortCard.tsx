import {
  Button,
  Caption1,
  Card,
  Field,
  Input,
  makeStyles,
  Spinner,
  Subtitle1,
  Toast,
  ToastTitle,
  tokens,
  useToastController,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import { useModelStore } from "../../stores/modelStore";

const useStyles = makeStyles({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

const PORT_VALID_RANGE = { min: 1024, max: 65535 };

const isValidPort = (port: number) =>
  Number.isInteger(port) && port >= PORT_VALID_RANGE.min && port <= PORT_VALID_RANGE.max;

/** Edits the GenieX server port: validates it, warns when it is taken, and saves it. */
export default function ServerPortCard() {
  const styles = useStyles();
  const { dispatchToast } = useToastController("app-toaster");
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);

  const [portValue, setPortValue] = useState(String(serverPort));
  const [portError, setPortError] = useState<string | null>(null);
  const [portInUse, setPortInUse] = useState(false);
  const [portChecking, setPortChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPortChanged = Number(portValue) !== serverPort;

  // Debounced probe: check if the new port is already occupied
  useEffect(() => {
    const port = Number(portValue);
    if (!isValidPort(port) || !isPortChanged) {
      setPortInUse(false);
      setPortChecking(false);
      return;
    }

    setPortChecking(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      geniex
        .isPortServing(port, controller.signal)
        .then(setPortInUse)
        .catch(() => setPortInUse(false))
        .finally(() => setPortChecking(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [portValue, isPortChanged]);

  const handleSave = useCallback(async () => {
    const parsed = Number(portValue);
    if (!isValidPort(parsed)) {
      setPortError(`Port must be ${PORT_VALID_RANGE.min}–${PORT_VALID_RANGE.max}`);
      return;
    }
    setPortError(null);
    if (isPortChanged && portInUse) return;

    setSaving(true);
    let saved = false;
    try {
      await db.setPreference("server_port", parsed, "number");
      setServerPort(parsed);
      saved = true;
    } catch (err) {
      console.error("Failed to save server settings:", err);
    }

    try {
      setServerStatus(await geniex.getServerStatus(parsed));
    } catch {
      // server may not be running on the new port
    }

    setSaving(false);
    if (saved) {
      dispatchToast(
        <Toast>
          <ToastTitle>Server settings saved</ToastTitle>
        </Toast>,
        { intent: "success" },
      );
    }
  }, [portValue, setServerPort, setServerStatus, isPortChanged, portInUse, dispatchToast]);

  const portInUseMessage =
    isPortChanged && portInUse
      ? `Port ${portValue} is already in use by another process`
      : undefined;

  return (
    <Card>
      <div className={styles.stack}>
        <Subtitle1>Server</Subtitle1>
        <Field
          label="Port"
          validationState={portError || portInUseMessage ? "error" : "none"}
          validationMessage={portError ?? portInUseMessage}
          hint={isPortChanged && portChecking ? "Checking port…" : undefined}
        >
          <Input
            type="number"
            value={portValue}
            min={PORT_VALID_RANGE.min}
            max={PORT_VALID_RANGE.max}
            onChange={(_, data) => {
              setPortValue(data.value);
              setPortError(null);
            }}
          />
        </Field>
        <Caption1>GenieX server endpoint: 127.0.0.1:{portValue || "…"}</Caption1>
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={handleSave}
            disabled={saving || (isPortChanged && portInUse)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
