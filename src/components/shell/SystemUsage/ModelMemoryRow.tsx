import { useModelStore } from "../../../stores/modelStore";
import { formatGigabytes } from "../../../utils/format";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { useContextMemory } from "./useContextMemory";
import { useContextWindow } from "./useContextWindow";

/**
 * Resident memory of the GenieX server beside the KV-cache reserved for the active model's context.
 * Mounted only while a GenieX model is loaded, since the context figures belong to that model.
 */
export function ModelMemoryRow({ modelBytes }: { modelBytes: number | null }) {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const contextWindow = useContextWindow(activeModelId);
  const contextBytes = useContextMemory(activeModelId, contextWindow);

  return (
    <Flex justify="between" align="center">
      <Meta>Model / context</Meta>
      <Meta>
        {formatGigabytes(modelBytes)} / {formatGigabytes(contextBytes)}
      </Meta>
    </Flex>
  );
}
