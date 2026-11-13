import { Button, Switch, Tooltip } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { useMcpStore } from "../../../../../stores/mcpStore";
import type { McpServerInfo, McpStatus } from "../../../../../types";
import {
  canRefresh,
  canStop,
  statusLabel,
  toolCountLabel,
  transportLabel,
} from "../../../../../utils/mcpServers";
import { Flex } from "../../../../ui/Flex/Flex";
import { type BadgeTone, StatusBadge } from "../../../../ui/StatusBadge/StatusBadge";
import { BodyStrong, Meta } from "../../../../ui/Typography/Typography";
import { McpErrorText } from "../McpErrorText/McpErrorText";
import "./McpServerRow.css";

const STATUS_TONE: Record<McpStatus, BadgeTone> = {
  stopped: "default",
  starting: "blue",
  running: "green",
  failed: "red",
};

interface McpServerRowProps {
  info: McpServerInfo;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * One MCP server: its name, transport, status and tool count, the connect-at-start switch, and the
 * Start or Stop, Refresh (running only), Edit and Remove buttons. A failed server shows its reason.
 * Buttons wait while a change to the server is in progress.
 */
export function McpServerRow({ info, onEdit, onRemove }: McpServerRowProps) {
  const { config, status, error, toolCount } = info;
  const busy = useMcpStore((s) => s.busyIds.includes(config.id));
  const start = useMcpStore((s) => s.start);
  const stop = useMcpStore((s) => s.stop);
  const refresh = useMcpStore((s) => s.refresh);
  const setEnabled = useMcpStore((s) => s.setEnabled);

  return (
    <div className="mcp-server-row">
      <Flex direction="column" gap="s">
        <Flex align="center" gap="s">
          <div className="flex-grow mcp-server-row__name">
            <BodyStrong>{config.name}</BodyStrong>
            <Meta>
              {transportLabel(config.transport)} · {toolCountLabel(toolCount)}
            </Meta>
          </div>
          <StatusBadge tone={STATUS_TONE[status]}>{statusLabel(status)}</StatusBadge>
        </Flex>

        {status === "failed" && error && <McpErrorText text={error} />}

        <Flex direction="column" gap="xs">
          <Switch
            label="Connect when LocalGenie starts"
            checked={config.enabled}
            disabled={busy}
            onChange={(_, data) => void setEnabled(config.id, data.checked)}
          />
          <Meta>
            Applies at the next launch. Switching it does not start or stop the server now.
          </Meta>
        </Flex>

        <Flex align="center" gap="s" wrap>
          {canStop(info) ? (
            <Button
              size="small"
              appearance="secondary"
              disabled={busy}
              onClick={() => void stop(config.id)}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="small"
              appearance="secondary"
              disabled={busy}
              onClick={() => void start(config.id)}
            >
              Start
            </Button>
          )}
          {canRefresh(info) && (
            <Tooltip content="Read the server's tools again" relationship="label">
              <Button
                size="small"
                appearance="secondary"
                icon={<ArrowClockwiseRegular />}
                disabled={busy}
                onClick={() => void refresh(config.id)}
              >
                Refresh
              </Button>
            </Tooltip>
          )}
          <Button size="small" appearance="secondary" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
          <Button size="small" appearance="secondary" disabled={busy} onClick={onRemove}>
            Remove
          </Button>
        </Flex>
      </Flex>
    </div>
  );
}
