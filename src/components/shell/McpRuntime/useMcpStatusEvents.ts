import { useEffect } from "react";
import { listenMcpServerStatus } from "../../../services/mcp";
import { useMcpStore } from "../../../stores/mcpStore";

/**
 * Keeps every MCP server's status current for the component's lifetime. Each event is handed to the
 * store, which also refreshes the tool list. A listener that finishes after unmount is removed at once.
 */
export function useMcpStatusEvents() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenMcpServerStatus((info) => useMcpStore.getState().applyStatus(info)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
