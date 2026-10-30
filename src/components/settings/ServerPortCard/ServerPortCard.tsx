import {
  Button,
  Caption1,
  Card,
  Field,
  Input,
  Spinner,
  Subtitle1,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useState } from "react";
import * as geniex from "../../../services/geniex";
import { saveServerPorts } from "../../../services/serverPorts";
import { useModelStore } from "../../../stores/modelStore";
import {
  COMPUTE_PORT_LABELS,
  COMPUTE_PORT_TARGETS,
  isValidPort,
  PORT_RANGE_MESSAGE,
  PORT_VALID_RANGE,
  portInUseMessage,
  portSettingWrites,
  portToProbe,
} from "../../../utils/serverPorts";
import { toast } from "../../../utils/toast";
import { describeSaveFailure } from "../../../utils/writeAllOrRollBack";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { useComputePortDrafts } from "./useComputePortDrafts";
import { usePortServing } from "./usePortServing";
import "./ServerPortCard.css";

/**
 * Edits the GenieX server port and the optional port of each compute. Validates them, warns when a
 * port is taken, and saves them together. An empty compute port means a random free port.
 */
export default function ServerPortCard() {
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);

  const [portValue, setPortValue] = useState(String(serverPort));
  const [portError, setPortError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mainPort = isValidPort(Number(portValue)) ? Number(portValue) : null;
  const mainProbe = usePortServing(portToProbe(mainPort, serverPort, undefined));
  const { drafts, setDraft, errors, checking, mainClash, draftPorts, savedPorts, markSaved } =
    useComputePortDrafts(mainPort);
  const hasComputeErrors = mainClash !== null || Object.keys(errors).length > 0;

  const handleSave = async () => {
    const parsed = Number(portValue);
    if (!isValidPort(parsed)) {
      setPortError(PORT_RANGE_MESSAGE);
      return;
    }
    setPortError(null);
    if (mainProbe.serving || hasComputeErrors) return;

    setSaving(true);
    const outcome = await saveServerPorts(
      portSettingWrites(
        { previous: serverPort, next: parsed },
        { previous: savedPorts, next: draftPorts },
      ),
    );
    let storedPort = serverPort;
    if (outcome.ok) {
      storedPort = parsed;
      setServerPort(parsed);
      markSaved(draftPorts);
      toast.success("Server settings saved");
    } else {
      toast.error(`Could not save the ${outcome.failed}`, describeSaveFailure(outcome));
    }

    try {
      setServerStatus(await geniex.getServerStatus(storedPort));
    } catch {
      // server may not be running on the port
    }
    setSaving(false);
  };

  const mainClashMessage = mainClash
    ? `Port ${portValue} is already used by the ${COMPUTE_PORT_LABELS[mainClash]} server`
    : undefined;
  const mainInUseMessage = mainProbe.serving ? portInUseMessage(Number(portValue)) : undefined;
  const portMessage = portError ?? mainClashMessage ?? mainInUseMessage;

  return (
    <Card>
      <div className="server-port-card__stack">
        <Subtitle1>Server</Subtitle1>
        <Field
          label="Port"
          validationState={portMessage ? "error" : "none"}
          validationMessage={portMessage}
          hint={mainProbe.checking ? "Checking port…" : undefined}
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
        <Flex gap="m" wrap>
          {COMPUTE_PORT_TARGETS.map((target) => (
            <Field
              key={target}
              label={`${COMPUTE_PORT_LABELS[target]} port`}
              validationState={errors[target] ? "error" : "none"}
              validationMessage={errors[target]}
              hint={checking[target] ? "Checking port…" : undefined}
            >
              <Input
                type="number"
                value={drafts[target]}
                placeholder="Random"
                onChange={(_, data) => setDraft(target, data.value)}
              />
            </Field>
          ))}
        </Flex>
        <Meta>Each compute can run its own server. An empty port uses a random free port.</Meta>
        <div className="server-port-card__actions">
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={handleSave}
            disabled={saving || mainProbe.serving || hasComputeErrors}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
