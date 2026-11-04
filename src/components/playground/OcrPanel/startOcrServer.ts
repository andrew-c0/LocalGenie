import * as db from "../../../services/database";
import * as geniex from "../../../services/geniex";
import { useModelStore } from "../../../stores/modelStore";
import { useOcrStore } from "../../../stores/ocrStore";
import { errorMessage } from "../../../utils/errorMessage";
import { OCR_SERVER_START_FAILED } from "../../../utils/ocrText";
import { toast } from "../../../utils/toast";

/**
 * Starts the GenieX server OCR runs on, the way the model loader does: the saved server settings and the
 * configured port. Called when an OCR model is selected. It does nothing while the server runs or is
 * already starting. The server reads OCR's compute choices with each job, so they are not passed here.
 * A failure is a toast; the panel's status line shows the server as stopped until it is selected again.
 */
export async function startOcrServer(): Promise<void> {
  const ocr = useOcrStore.getState();
  if (ocr.serverStarting || useModelStore.getState().serverStatus.running) return;

  ocr.setServerStarting(true);
  try {
    const serverSettings = await db.getServerSettings();
    const started = await geniex.startServer({
      port: useModelStore.getState().serverPort,
      ...serverSettings,
    });
    useModelStore.getState().setServerStatus(started);
    useModelStore.getState().setServerOptions(serverSettings);
  } catch (err) {
    toast.error(OCR_SERVER_START_FAILED, errorMessage(err));
  } finally {
    useOcrStore.getState().setServerStarting(false);
  }
}
