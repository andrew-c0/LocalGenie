import { Button, Popover, PopoverTrigger } from "@fluentui/react-components";
import { ChevronDownRegular } from "@fluentui/react-icons";
import type { ComponentProps } from "react";
import { useModelStore } from "../../../../stores/modelStore";
import ModelSelectorPopover from "../ModelSelectorPopover/ModelSelectorPopover";

/** The loader's state and actions the chat selector's popover uses. The header's loader owns them. */
type ChatModelSelectorProps = Pick<
  ComponentProps<typeof ModelSelectorPopover>,
  "loading" | "error" | "onSelect" | "onComputeChange" | "onUnload"
>;

/**
 * The chat model selector in the header: the active model and its popover. It is shown on every page
 * except the Playground's, and it does not load models itself (`useModelLoader` in the header does).
 */
export function ChatModelSelector({
  loading,
  error,
  onSelect,
  onComputeChange,
  onUnload,
}: ChatModelSelectorProps) {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);

  const activeName = activeModelId ?? serverStatus.models[0] ?? null;
  const activeLabel = activeName ? activeName.split("/").pop() : null;

  return (
    <Popover
      open={selectorOpen}
      onOpenChange={(_, change) => setSelectorOpen(change.open)}
      positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button
          appearance="secondary"
          icon={<ChevronDownRegular />}
          iconPosition="after"
          aria-label="Switch active model"
          title="Switch active model"
          className="flex-grow header__model"
        >
          {activeLabel ? `Active Model: ${activeLabel}` : "Model selector: no model loaded"}
        </Button>
      </PopoverTrigger>
      <ModelSelectorPopover
        loading={loading}
        error={error}
        onSelect={onSelect}
        onComputeChange={onComputeChange}
        onUnload={onUnload}
      />
    </Popover>
  );
}
