import { Button, Caption1, Label, Tooltip } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import "./SettingField.css";

interface SettingFieldProps {
  label: string;
  /** What the setting does. Shown from the info icon. */
  info: string;
  /** Why the control is disabled for this model. Set only when it cannot be changed. */
  disabledReason?: string;
  /** A saved value the engine ignores, or a setting that cannot work as saved. Shown in place of the disabled reason. */
  warning?: string;
  /** Extra context that does not block the control, such as a heuristic. */
  note?: string;
  children: ReactNode;
}

/** A labelled setting with an info icon. A disabled setting explains why, in a tooltip and a caption. */
export default function SettingField({
  label,
  info,
  disabledReason,
  warning,
  note,
  children,
}: SettingFieldProps) {
  const labelNode = (
    <Label className="setting-field__label" disabled={!!disabledReason}>
      {label}
    </Label>
  );

  return (
    <div className="setting-field">
      <div className="setting-field__header">
        {disabledReason ? (
          <Tooltip content={disabledReason} relationship="description">
            {labelNode}
          </Tooltip>
        ) : (
          labelNode
        )}
        <Tooltip content={info} relationship="description">
          <Button
            appearance="transparent"
            size="small"
            icon={<InfoRegular />}
            aria-label={`About ${label}`}
          />
        </Tooltip>
      </div>
      {children}
      {warning ? (
        <Caption1 className="setting-field__warning">{warning}</Caption1>
      ) : (
        disabledReason && <Caption1 className="setting-field__reason">{disabledReason}</Caption1>
      )}
      {note && <Caption1 className="setting-field__note">{note}</Caption1>}
    </div>
  );
}
