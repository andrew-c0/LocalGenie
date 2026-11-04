import { Button, Radio, RadioGroup, type RadioGroupOnChangeData } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import type { ComputeRowView } from "../../../../../../utils/playgroundCompute";
import type { ComputeControls } from "../../../../../playground/ImageGeneration/useComputeDevices";
import { chooseRunOn } from "../../../../../playground/playgroundSelection";
import { Flex } from "../../../../../ui/Flex/Flex";
import { HelpLabel } from "../../../../../ui/HelpLabel/HelpLabel";
import { Body, Meta } from "../../../../../ui/Typography/Typography";
import "./ComputeRunOnRow.css";

interface ComputeRunOnRowProps {
  row: ComputeRowView;
  /** Why the devices could not be read. Shown in place of the row's hint. */
  error: string | null;
  /** The device refresh. Given for the image tools' row only. */
  refresh?: Pick<ComputeControls, "canRefresh" | "refresh">;
}

/**
 * One "Run on" row, laid out like the chat selector's: the label at the left, the options at the right,
 * and the hint right-aligned below. A disabled option is a choice the tool does not support.
 */
export function ComputeRunOnRow({ row, error, refresh }: ComputeRunOnRowProps) {
  const hint = error ?? row.hint;

  const handleChange = (_: unknown, data: RadioGroupOnChangeData) => {
    const chosen = row.options.find((option) => option.value === data.value)?.value;
    if (chosen !== undefined && row.setting !== null) chooseRunOn(row.setting, chosen);
  };

  return (
    <Flex direction="column" gap="xxs" align="stretch" className="compute-run-on">
      <Flex align="center" justify="between" gap="m">
        {row.help ? <HelpLabel label={row.label} help={row.help} /> : <Body>{row.label}</Body>}
        <RadioGroup
          className="compute-run-on__options"
          layout="horizontal"
          value={row.value}
          onChange={handleChange}
          aria-label={row.label}
        >
          {row.options.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={option.label}
              disabled={!option.enabled}
            />
          ))}
        </RadioGroup>
      </Flex>
      {(hint || refresh) && (
        <Flex justify="end" align="center" gap="xs">
          {hint && <Meta>{hint}</Meta>}
          {refresh && (
            <Button
              size="small"
              appearance="secondary"
              icon={<ArrowClockwiseRegular />}
              aria-label="Refresh compute devices"
              title="Refresh compute devices"
              disabled={!refresh.canRefresh}
              onClick={refresh.refresh}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
}
