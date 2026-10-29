import { Button, Field } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import type { PlaygroundDevice } from "../../../../types";
import { computeOptions, isCpuOnlyBuild, isGpuSelection } from "../../../../utils/playground";
import {
  COMPUTE_HELP,
  CPU_ONLY_BUILD_HINT,
  GPU_EXPERIMENTAL_HINT,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { OptionDropdown } from "../../../ui/OptionDropdown/OptionDropdown";
import type { ComputeControls } from "../useComputeDevices";

interface ComputeFieldProps {
  /** "auto" or a device name. */
  selected: string;
  onSelect: (device: string) => void;
  controls: ComputeControls;
}

/**
 * The line under the dropdown: why the devices could not be read, else a warning for a selected GPU,
 * else the CPU-only note.
 */
function computeHint(
  selected: string,
  devices: PlaygroundDevice[] | null,
  error: string | null,
): string | undefined {
  if (error) return error;
  if (!devices) return undefined;
  if (isGpuSelection(selected, devices)) return GPU_EXPERIMENTAL_HINT;
  return isCpuOnlyBuild(devices) ? CPU_ONLY_BUILD_HINT : undefined;
}

/** The Compute dropdown with a refresh button. Only the devices the build lists are offered. */
export function ComputeField({ selected, onSelect, controls }: ComputeFieldProps) {
  const { devices, error, canRefresh, refresh } = controls;

  return (
    <Flex gap="s" align="end">
      <Field
        className="flex-grow"
        label={<HelpLabel label="Compute" help={COMPUTE_HELP} />}
        hint={computeHint(selected, devices, error)}
      >
        <OptionDropdown
          fullWidth
          options={computeOptions(devices ?? [])}
          value={selected}
          onChange={onSelect}
          disabled={devices === null}
        />
      </Field>
      <Button
        appearance="secondary"
        icon={<ArrowClockwiseRegular />}
        aria-label="Refresh compute devices"
        title="Refresh compute devices"
        disabled={!canRefresh}
        onClick={refresh}
      />
    </Flex>
  );
}
