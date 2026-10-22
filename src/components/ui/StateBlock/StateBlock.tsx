import { Text } from "@fluentui/react-components";
import type { ReactNode } from "react";
import "./StateBlock.css";

/** Empty / loading / error state block. */
export function StateBlock({
  icon,
  message,
  children,
}: {
  icon?: ReactNode;
  message: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="state-block__state-block">
      {icon && <Text size={600}>{icon}</Text>}
      <Text>{message}</Text>
      {children}
    </div>
  );
}
