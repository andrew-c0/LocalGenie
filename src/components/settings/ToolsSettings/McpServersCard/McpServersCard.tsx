import { Button } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useMcpStore } from "../../../../stores/mcpStore";
import type { McpServerConfig, McpServerInfo } from "../../../../types";
import { sortServersByName } from "../../../../utils/mcpServers";
import { ConfirmDialog } from "../../../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../../ui/Flex/Flex";
import { RetryBlock } from "../../../ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../../ui/Skeletons/SkeletonRows";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Meta, Secondary } from "../../../ui/Typography/Typography";
import { McpServerDialog } from "./McpServerDialog/McpServerDialog";
import { McpServerRow } from "./McpServerRow/McpServerRow";

/** The server form while it is open: `config` is the server being edited, or null for a new one. */
interface OpenForm {
  config: McpServerConfig | null;
}

/**
 * Settings > Tools: the MCP servers the user added, each with its status, tool count and controls.
 * Shows a skeleton while the list loads and a retry when it fails. Removing a server asks first.
 */
export function McpServersCard() {
  const loaded = useMcpStore((s) => s.loaded);
  const loadError = useMcpStore((s) => s.loadError);
  const servers = useMcpStore((s) => s.servers);
  const load = useMcpStore((s) => s.load);
  const remove = useMcpStore((s) => s.remove);
  const [form, setForm] = useState<OpenForm | null>(null);
  const [removing, setRemoving] = useState<McpServerInfo | null>(null);
  const list = sortServersByName(Object.values(servers));
  const failed = !loaded && loadError !== null;

  const confirmRemove = () => {
    if (!removing) return;
    const id = removing.config.id;
    setRemoving(null);
    void remove(id);
  };

  return (
    <SurfaceCard
      title="MCP servers"
      action={
        <Button
          appearance="secondary"
          icon={<AddRegular />}
          disabled={!loaded}
          onClick={() => setForm({ config: null })}
        >
          Add server
        </Button>
      }
    >
      <Flex direction="column" gap="m">
        <Secondary>
          An MCP server offers tools to the models. Its tools appear in the list while it runs. A
          server connects when LocalGenie starts if its switch is on.
        </Secondary>

        {!loaded && !failed && <SkeletonRows count={2} />}
        {failed && (
          <RetryBlock
            compact
            error={loadError}
            subject="LocalGenie MCP servers"
            lead="Could not load the MCP servers."
            onRetry={() => void load()}
          />
        )}
        {loaded && list.length === 0 && <Meta>No MCP servers yet.</Meta>}
        {loaded &&
          list.map((info) => (
            <McpServerRow
              key={info.config.id}
              info={info}
              onEdit={() => setForm({ config: info.config })}
              onRemove={() => setRemoving(info)}
            />
          ))}
      </Flex>

      {form && <McpServerDialog config={form.config} onClose={() => setForm(null)} />}
      {removing && (
        <ConfirmDialog
          title="Remove this MCP server?"
          message={`${removing.config.name} is removed and its tools leave the tool list. Its command or address and the values you typed are deleted too.`}
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </SurfaceCard>
  );
}
