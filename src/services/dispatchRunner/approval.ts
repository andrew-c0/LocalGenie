import { useDispatchStore } from "../../stores/dispatchStore";
import type { ApprovalDecision } from "../../stores/toolApprovalStore";
import { useToolStore } from "../../stores/toolStore";
import type { ChatToolCall, DispatchStatus } from "../../types";
import { approvalNotice } from "../../utils/dispatchTask";
import { toolLabel } from "../../utils/toolLines";
import { requestToolApproval } from "../toolLoop";
import { notifyIfHidden } from "../trayStatus";
import { findTask, type Turn, taskNamed } from "./state";

/**
 * Asks the user before a call of a tool set to Request approval runs in a Dispatch conversation. It uses the
 * chat's approval dialog. While the question is open the conversation reads Needs you, and a hidden window gets
 * a notice. After the answer the status goes back to running. A stop that came before the question is answered
 * "cancel", so nothing waits for a dialog that will never be answered.
 */
export async function askWhileNeedsYou(turn: Turn, call: ChatToolCall): Promise<ApprovalDecision> {
  const task = taskNamed(turn.taskId);
  await setTaskStatus(turn.taskId, "needs_you");
  try {
    if (turn.stopRequested) return "cancel";
    const { title, body } = approvalNotice(task.goal, labelOf(call.name));
    void notifyIfHidden(title, body);
    return await requestToolApproval(turn.sessionId, call);
  } finally {
    await setTaskStatus(turn.taskId, "running");
  }
}

/** The tool's label as the dialog shows it, for the notice. */
function labelOf(name: string): string {
  const spec = useToolStore.getState().tools.find((tool) => tool.name === name);
  return toolLabel(name, spec?.serverName);
}

/**
 * Saves a conversation's status. A failed save is logged and the status is kept in the store, so the
 * conversation still shows the state the turn is in.
 */
async function setTaskStatus(taskId: string, status: DispatchStatus): Promise<void> {
  try {
    await useDispatchStore.getState().update(taskId, { status });
  } catch (err) {
    console.warn("[dispatch] Could not save a conversation's status:", err);
    const task = findTask(taskId);
    if (task) useDispatchStore.getState().applyTask({ ...task, status });
  }
}
