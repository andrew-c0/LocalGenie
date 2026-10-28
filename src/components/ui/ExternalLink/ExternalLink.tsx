import { Link } from "@fluentui/react-components";
import type { MouseEvent } from "react";
import { openExternal } from "../../../services/system";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** Link that opens in the system browser instead of inside the webview. */
export function ExternalLink({ url, children }: { url: string; children?: string }) {
  const open = (event: MouseEvent) => {
    event.preventDefault();
    openExternal(url).catch((err: unknown) =>
      toast.error("Could not open link", errorMessage(err)),
    );
  };
  return (
    <Link href={url} onClick={open}>
      {children ?? url}
    </Link>
  );
}
