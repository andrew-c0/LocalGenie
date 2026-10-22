import type { DropdownProps } from "@fluentui/react-components";
import { Dropdown, Field, Option } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { Flex } from "../Flex/Flex";
import { Body, Meta } from "../Typography/Typography";

export interface DropdownOption<T extends string = string> {
  value: T;
  /** Title of the option in the list. */
  label: string;
  /** Text shown in the field once selected. Defaults to `label`. */
  selectedLabel?: string;
  /** Optional supporting line under the title (plain text). Ignored when `content` is given. */
  description?: ReactNode;
  /** Custom list content, for example a title row with coloured badges. Replaces `label` and `description`. */
  content?: ReactNode;
  disabled?: boolean;
}

export interface OptionDropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  /** Selected option value, or null for none. */
  value: T | null;
  onChange: (value: T) => void;
  /** Visible label above the field. Also used as the accessible name when given. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: DropdownProps["size"];
  appearance?: DropdownProps["appearance"];
  /** Stretch the field to the width of its container. */
  fullWidth?: boolean;
}

/**
 * Fluent Dropdown with a typed option list. Each option renders its own content (title, description
 * or custom rows with badges), and the field shows `selectedLabel` once chosen, so details that
 * matter for the choice can be read in the list and in the field instead of repeated below it.
 */
export function OptionDropdown<T extends string = string>({
  options,
  value,
  onChange,
  label,
  placeholder,
  disabled,
  size = "medium",
  appearance = "outline",
  fullWidth,
}: OptionDropdownProps<T>) {
  const selected = options.find((o) => o.value === value);

  const dropdown = (
    <Dropdown
      aria-label={label}
      placeholder={placeholder}
      value={selected ? (selected.selectedLabel ?? selected.label) : ""}
      selectedOptions={value ? [value] : []}
      disabled={disabled}
      size={size}
      appearance={appearance}
      onOptionSelect={(_, data) => {
        if (data.optionValue) onChange(data.optionValue as T);
      }}
    >
      {options.map((option) => (
        <Option
          key={option.value}
          value={option.value}
          text={option.selectedLabel ?? option.label}
          disabled={option.disabled}
        >
          {option.content ?? (
            <Flex direction="column" gap="xxs">
              <Body>{option.label}</Body>
              {option.description && <Meta>{option.description}</Meta>}
            </Flex>
          )}
        </Option>
      ))}
    </Dropdown>
  );

  // A column flex container stretches its child to the full width without overriding Fluent styles.
  const field = fullWidth ? (
    <Flex direction="column" align="stretch">
      {dropdown}
    </Flex>
  ) : (
    dropdown
  );

  return label ? <Field label={<Body>{label}</Body>}>{field}</Field> : field;
}
