import { useModelStore } from "../../stores/modelStore";
import { errorMessage } from "../../utils/errorMessage";
import { shortModelKey } from "../../utils/modelKey";
import { activateModel } from "../modelLoad";
import { waitForChatIdle } from "./chatGate";
import { recordedModelOf } from "./state";

/**
 * Makes the model a conversation recorded the loaded one, before its turn starts. The load starts the server
 * when it is stopped, with the saved server settings, and loads the model with its saved parameters. A
 * conversation with no recorded model keeps whatever is loaded. Rejects with the reason, which names the model,
 * when it is no longer installed or the server or the model cannot start.
 */
export async function loadRecordedModel(sessionId: string): Promise<void> {
  const recorded = recordedModelOf(sessionId);
  if (recorded === undefined) return;
  const loaded = useModelStore.getState().activeModelId;
  if (loaded !== null && shortModelKey(loaded) === shortModelKey(recorded)) return;

  const installed = useModelStore.getState().models.some((model) => model.name === recorded);
  if (!installed) {
    throw new Error(
      `${recorded} is no longer installed, so this conversation cannot continue on it.`,
    );
  }
  await waitForChatIdle();
  try {
    await activateModel(recorded);
  } catch (err) {
    throw new Error(`Could not load ${recorded} for this conversation: ${errorMessage(err)}`);
  }
}
