import { MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import type { ModelCapabilities } from "../../../types";
import { capabilityRows } from "../../../utils/modelCapabilities";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Body } from "../../ui/Typography/Typography";
import type { CapabilityMap } from "./types";

interface Props {
  capabilities: ModelCapabilities | null;
  capabilitiesError: string | null;
  caps: CapabilityMap;
}

/** The model file's facts. Thinking, tools, vision and audio show the latest scan's result. */
export default function ModelFactsCard({ capabilities, capabilitiesError, caps }: Props) {
  return (
    <SurfaceCard title="Model">
      {capabilities ? (
        <dl className="model-settings__facts">
          {capabilityRows(capabilities, caps).map((row) => (
            <div key={row.label} className="model-settings__fact">
              <dt>
                <Body className="model-settings__fact-label">{row.label}</Body>
              </dt>
              <dd>
                <Body>{row.value}</Body>
              </dd>
            </div>
          ))}
        </dl>
      ) : capabilitiesError ? (
        <MessageBar intent="warning">
          <MessageBarBody>Could not read the model file: {capabilitiesError}</MessageBarBody>
        </MessageBar>
      ) : (
        <Spinner size="tiny" label="Reading the model file…" />
      )}
      <Body className="model-settings__hint">
        Thinking, tool calls, vision and audio show Supported, Not supported or Not tested, from the
        latest scan.
      </Body>
    </SurfaceCard>
  );
}
