import type { DispatchTask } from "../types";
import { cutChars, TITLE_MAX_CHARS } from "./dispatchTask";

/** The most titles the resume dialog lists. The rest are counted. */
export const RESUME_LIST_MAX = 5;

/** The label of a conversation whose session recorded no model: it continues on the loaded one. */
const LOADED_MODEL_LABEL = "the loaded model";

/** Interrupted conversations, oldest first: the ones the resume offer may continue. */
export function interruptedTasks(tasks: readonly DispatchTask[]): DispatchTask[] {
  return tasks
    .filter((task) => task.status === "interrupted")
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Interrupted conversations that used one model. `modelId` is null when the session recorded none. */
export interface ResumeGroup {
  modelId: string | null;
  tasks: DispatchTask[];
}

/**
 * Groups conversations by the model they used. The groups come in the order their first conversation appears,
 * and each group keeps its conversations' order. Continuing runs group after group, so each model loads once.
 */
export function groupByModel(
  tasks: readonly DispatchTask[],
  modelOf: (task: DispatchTask) => string | null,
): ResumeGroup[] {
  const groups = new Map<string | null, DispatchTask[]>();
  for (const task of tasks) {
    const modelId = modelOf(task);
    const group = groups.get(modelId);
    if (group) group.push(task);
    else groups.set(modelId, [task]);
  }
  return [...groups].map(([modelId, groupTasks]) => ({ modelId, tasks: groupTasks }));
}

/** The conversations in the order they continue: group after group. */
export function continueOrder(groups: readonly ResumeGroup[]): DispatchTask[] {
  return groups.flatMap((group) => group.tasks);
}

/** What the resume offer knows when it decides. */
export interface ResumeState {
  /** How many conversations are interrupted. */
  candidates: number;
  cliInstalled: boolean;
  /** A chat reply, a summary or a Dispatch turn is in progress. */
  busy: boolean;
}

/**
 * True when the resume dialog is shown: conversations are interrupted, the CLI is installed (so a server can be
 * started) and nothing is in progress. The server need not be running: Continue starts it. Otherwise the offer is
 * skipped this start, and the conversations stay interrupted for the next one.
 */
export function shouldOfferResume(state: ResumeState): boolean {
  return state.candidates > 0 && state.cliInstalled && !state.busy;
}

/** One title the dialog lists. The id keeps the list keys unique when two conversations share a title. */
export interface ResumeListItem {
  id: string;
  title: string;
}

/** The titles the dialog lists: the first RESUME_LIST_MAX conversations, and how many more there are. */
export function resumeListOf(tasks: readonly DispatchTask[]): {
  items: ResumeListItem[];
  more: number;
} {
  const items = tasks.slice(0, RESUME_LIST_MAX).map((task) => ({
    id: task.id,
    title: cutChars(task.goal, TITLE_MAX_CHARS),
  }));
  return { items, more: Math.max(0, tasks.length - RESUME_LIST_MAX) };
}

/** The dialog's text for a set of groups: the question, the titles (only for more than one), and the model line. */
export interface ResumeCopy {
  intro: string;
  items: ResumeListItem[];
  more: number;
  modelLine: string;
}

/** The copy of the resume dialog. The list appears only for more than one conversation. */
export function resumeCopy(groups: readonly ResumeGroup[]): ResumeCopy {
  const tasks = continueOrder(groups);
  const labels = modelLabelsOf(groups);
  const list = tasks.length > 1 ? resumeListOf(tasks) : { items: [], more: 0 };
  return {
    intro: resumeIntro(tasks.length, labels.length),
    items: list.items,
    more: list.more,
    modelLine: labels.length === 1 ? `Model: ${labels[0]}` : `Models: ${labels.join(", ")}`,
  };
}

/** The distinct models the groups used, in group order. A group with no recorded model counts as the loaded one. */
export function modelLabelsOf(groups: readonly ResumeGroup[]): string[] {
  const labels = groups.map((group) => group.modelId ?? LOADED_MODEL_LABEL);
  return [...new Set(labels)];
}

/** The question of the dialog: about one conversation or several, and one model or several. */
export function resumeIntro(conversations: number, models: number): string {
  const pronoun = conversations === 1 ? "it" : "them";
  const noun = models === 1 ? "model" : "models";
  return `The last Dispatch run was incomplete. Continue ${pronoun} with the previously selected ${noun}?`;
}
