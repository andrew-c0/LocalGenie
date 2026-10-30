import { useState } from "react";
import * as db from "../../../services/database";
import * as geniex from "../../../services/geniex";
import { useModelStore } from "../../../stores/modelStore";
import { errorMessage } from "../../../utils/errorMessage";
import { OCR_SERVER_START_FAILED } from "../../../utils/ocrText";

/**
 * The GenieX server as OCR needs it: whether it runs, and a way to start it the way the model
 * loader does (saved server settings, the configured port). The result goes to the model store.
 */
export function useOcrServer() {
  const running = useModelStore((s) => s.serverStatus.running);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const store = useModelStore.getState();
    setStarting(true);
    setError(null);
    try {
      const serverSettings = await db.getServerSettings();
      const started = await geniex.startServer({ port: store.serverPort, ...serverSettings });
      store.setServerStatus(started);
      store.setServerOptions(serverSettings);
    } catch (err) {
      setError(errorMessage(err, OCR_SERVER_START_FAILED));
    } finally {
      setStarting(false);
    }
  };

  return { running, starting, error, start };
}
