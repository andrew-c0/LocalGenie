import { usePlaygroundDownloadBusy } from "../../../../hooks/usePlaygroundDownload";
import { playgroundToolOf, routeById } from "../../../../navigation/routeUtils";
import { useOcrStore } from "../../../../stores/ocrStore";
import { usePlaygroundStore } from "../../../../stores/playgroundStore";
import { useSpeechStore } from "../../../../stores/speechStore";
import { SD_CPP_RUNTIME_ID } from "../../../../utils/playground";
import { type ComputeRowView, computeRowsOf } from "../../../../utils/playgroundCompute";
import {
  buildToolModels,
  type PlaygroundSelectorInput,
  type ToolModels,
  toolIdOf,
} from "../../../../utils/playgroundSelector";
import {
  type ComputeControls,
  useComputeDevices,
} from "../../../playground/ImageGeneration/useComputeDevices";
import {
  type PlaygroundCatalogs,
  usePlaygroundCatalogs,
} from "../../../playground/usePlaygroundCatalogs";
import { useRuntimeCheck } from "../../../playground/useRuntimeCheck";

/** What the Playground selector shows, read from the stores on the current page. */
export interface PlaygroundSelectorData {
  /** The tools the popover lists: the page's tool, or every tool on the landing. */
  tools: ToolModels[];
  /** The tool the page shows, with the model it uses. Null on the landing. */
  currentTool: ToolModels | null;
  /** Each catalog's read state. */
  catalogs: PlaygroundCatalogs;
  /** The "Run on" rows of the page's tool. Empty on the landing. */
  computeRows: ComputeRowView[];
  /** The compute devices, for the image tools' refresh and error. */
  compute: ComputeControls;
  /** A Playground download is queued or running. Other Download buttons wait for it. */
  isAnyDownloading: boolean;
}

function titleOf(routeId: string): string {
  return routeById(routeId)?.title ?? routeId;
}

/** The store values every tool's model list and selection are built from. */
function usePlaygroundSelectorInput(): PlaygroundSelectorInput {
  const image = usePlaygroundStore((s) => s.models);
  const imageSelectedId = usePlaygroundStore((s) => s.selectedModelId);
  const upscale = usePlaygroundStore((s) => s.upscaleModels);
  const upscaleSelectedId = usePlaygroundStore((s) => s.upscaleModelId);
  const ocr = useOcrStore((s) => s.models);
  const ocrSelectedId = useOcrStore((s) => s.selectedModelId);
  const speech = useSpeechStore((s) => s.models);
  const speechSelectedIds = useSpeechStore((s) => s.selectedModelIds);
  const audioTask = useSpeechStore((s) => s.audioTask);
  const enhanceKind = useSpeechStore((s) => s.enhanceKind);

  return {
    image,
    imageSelectedId,
    upscale,
    upscaleSelectedId,
    ocr,
    ocrSelectedId,
    speech,
    speechSelectedIds,
    audioTask,
    enhanceKind,
  };
}

/**
 * Reads the catalogs (so the selector has every tool's models), the stores the tools' models and
 * compute choices come from, and the image devices. The page's tool comes from the pathname.
 */
export function usePlaygroundSelectorData(pathname: string): PlaygroundSelectorData {
  const routeId = playgroundToolOf(pathname)?.id ?? null;
  const toolId = routeId === null ? null : toolIdOf(routeId);

  const catalogs = usePlaygroundCatalogs();
  const input = usePlaygroundSelectorInput();
  const devices = usePlaygroundStore((s) => s.devices);
  const device = usePlaygroundStore((s) => s.form.device);
  const ocrSettings = useOcrStore((s) => s.settings);

  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const compute = useComputeDevices(runtime.status);
  const isAnyDownloading = usePlaygroundDownloadBusy();

  const allTools = buildToolModels(input, titleOf);
  const currentTool = allTools.find((tool) => tool.toolId === toolId) ?? null;

  return {
    tools: toolId === null ? allTools : allTools.filter((tool) => tool.toolId === toolId),
    currentTool,
    catalogs,
    computeRows: computeRowsOf(toolId, { devices, device, ocr: ocrSettings }),
    compute,
    isAnyDownloading,
  };
}
