import { invoke } from "@tauri-apps/api/core";
import type { DispatchPatch, DispatchTask } from "../types";

/** Every Dispatch conversation, newest first. Their sessions are loaded with the chats. */
export function listDispatchTasks(): Promise<DispatchTask[]> {
  return invoke("dispatch_list");
}

/**
 * Creates a queued conversation with its own session. The goal is the first message and the session's
 * title. `allowedTools` is the record of the tools whose Dispatch state was On or Request approval when it was made.
 */
export function createDispatchTask(goal: string, allowedTools: string[]): Promise<DispatchTask> {
  return invoke("dispatch_create", { goal, allowedTools });
}

/** Changes the fields in `patch` and returns the conversation as it is now. */
export function updateDispatchTask(id: string, patch: DispatchPatch): Promise<DispatchTask> {
  return invoke("dispatch_update", { id, patch });
}

/** Removes a conversation with its session and messages. */
export function deleteDispatchTask(id: string): Promise<void> {
  return invoke("dispatch_delete", { id });
}
