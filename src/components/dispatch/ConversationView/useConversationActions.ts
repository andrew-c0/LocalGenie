import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { continueTask, sendMessage, stopTask } from "../../../services/dispatchRunner";
import { useDispatchStore } from "../../../stores/dispatchStore";
import type { ConversationAction } from "../../../utils/dispatchStatus";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** What a conversation's controls do: the action in progress (or null), and one handler per control. */
export interface ConversationActionHandlers {
  pendingAction: ConversationAction | null;
  /** Sends a message. Resolves to true when it was accepted; a refusal is a toast and false. */
  send: (text: string) => Promise<boolean>;
  stop: () => void;
  continue: () => void;
  remove: () => void;
}

/**
 * The controls of one conversation. A header action runs once at a time; a refusal or failure shows as a
 * toast and leaves the conversation as it was. Delete goes back to the Dispatch page.
 */
export function useConversationActions(taskId: string): ConversationActionHandlers {
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<ConversationAction | null>(null);

  const run = async (action: ConversationAction, failure: string, work: () => Promise<void>) => {
    setPendingAction(action);
    try {
      await work();
    } catch (err) {
      toast.error(failure, errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  };

  return {
    pendingAction,
    send: async (text) => {
      try {
        await sendMessage(taskId, text);
        return true;
      } catch (err) {
        toast.error("Could not send the message", errorMessage(err));
        return false;
      }
    },
    stop: () => {
      stopTask(taskId).catch((err: unknown) => {
        toast.error("Could not stop the conversation", errorMessage(err));
      });
    },
    continue: () => {
      void run("continue", "Could not continue the conversation", () => continueTask(taskId));
    },
    remove: () => {
      void run("delete", "Could not delete the conversation", async () => {
        await useDispatchStore.getState().remove(taskId);
        navigate("/dispatch");
      });
    },
  };
}
