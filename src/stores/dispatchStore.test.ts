import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchTask } from "../types";
import { useChatStore } from "./chatStore";
import { useDispatchStore } from "./dispatchStore";

const listDispatchTasks = vi.fn();
const createDispatchTask = vi.fn();
const updateDispatchTask = vi.fn();
const deleteDispatchTask = vi.fn();
vi.mock("../services/dispatch", () => ({
  listDispatchTasks: () => listDispatchTasks(),
  createDispatchTask: (...args: unknown[]) => createDispatchTask(...args),
  updateDispatchTask: (...args: unknown[]) => updateDispatchTask(...args),
  deleteDispatchTask: (...args: unknown[]) => deleteDispatchTask(...args),
}));

function task(overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    id: "t1",
    sessionId: "s1",
    goal: "Read the notes",
    status: "queued",
    allowedTools: ["read_text_file"],
    limits: { maxSteps: 0, maxMinutes: 0 },
    notes: "",
    report: null,
    error: null,
    steps: 0,
    createdAt: 100,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDispatchStore.setState({ tasks: [], loaded: false, loadError: null, runningTaskId: null });
  useChatStore.setState({ sessions: [], activeSessionId: null });
});

describe("load", () => {
  it("reads the conversations and marks the running one", async () => {
    listDispatchTasks.mockResolvedValue([task({ id: "a" }), task({ id: "b", status: "running" })]);
    await useDispatchStore.getState().load();
    const state = useDispatchStore.getState();
    expect(state.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(state.loaded).toBe(true);
    expect(state.runningTaskId).toBe("b");
  });

  it("keeps the first-load failure and leaves the list empty", async () => {
    const failure = new Error("database locked");
    listDispatchTasks.mockRejectedValue(failure);
    await useDispatchStore.getState().load();
    const state = useDispatchStore.getState();
    expect(state.loaded).toBe(false);
    expect(state.loadError).toBe(failure);
    expect(state.tasks).toEqual([]);
  });
});

describe("create", () => {
  it("creates a queued conversation with the goal and the tools, and adds its session as a dispatch session", async () => {
    const created = task({ id: "new", sessionId: "sess-new", goal: "Read the notes" });
    createDispatchTask.mockResolvedValue(created);

    const result = await useDispatchStore.getState().create("Read the notes", ["read_text_file"]);

    expect(createDispatchTask).toHaveBeenCalledWith("Read the notes", ["read_text_file"]);
    expect(result).toBe(created);
    expect(useDispatchStore.getState().tasks[0]).toBe(created);
    const session = useChatStore.getState().sessions.find((s) => s.id === "sess-new");
    expect(session?.kind).toBe("dispatch");
    expect(session?.title).toBe("Read the notes");
    expect(session?.messages).toEqual([]);
  });

  it("adds nothing when the conversation cannot be created", async () => {
    createDispatchTask.mockRejectedValue(new Error("A Dispatch conversation needs a goal."));
    await expect(useDispatchStore.getState().create("  ", [])).rejects.toThrow("needs a goal");
    expect(useDispatchStore.getState().tasks).toEqual([]);
    expect(useChatStore.getState().sessions).toEqual([]);
  });
});

describe("update and applyTask", () => {
  it("replaces the conversation with the saved copy and follows its running state", async () => {
    useDispatchStore.setState({ tasks: [task()] });
    updateDispatchTask.mockResolvedValue(task({ status: "running", steps: 1 }));

    await useDispatchStore.getState().update("t1", { status: "running", startedAt: 5 });

    expect(updateDispatchTask).toHaveBeenCalledWith("t1", { status: "running", startedAt: 5 });
    expect(useDispatchStore.getState().tasks).toHaveLength(1);
    expect(useDispatchStore.getState().tasks[0].steps).toBe(1);
    expect(useDispatchStore.getState().runningTaskId).toBe("t1");
  });

  it("clears the running conversation when its turn ends, and keeps another one's running id", () => {
    useDispatchStore.setState({
      tasks: [task({ id: "a", status: "running" }), task({ id: "b" })],
      runningTaskId: "a",
    });
    useDispatchStore.getState().applyTask(task({ id: "b", status: "queued" }));
    expect(useDispatchStore.getState().runningTaskId).toBe("a");

    useDispatchStore.getState().applyTask(task({ id: "a", status: "done" }));
    expect(useDispatchStore.getState().runningTaskId).toBeNull();
  });

  it("puts a conversation it does not know first in the list", () => {
    useDispatchStore.setState({ tasks: [task({ id: "old" })] });
    useDispatchStore.getState().applyTask(task({ id: "new" }));
    expect(useDispatchStore.getState().tasks.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("leaves the list alone when an update fails", async () => {
    useDispatchStore.setState({ tasks: [task()] });
    updateDispatchTask.mockRejectedValue(new Error("nope"));
    await expect(useDispatchStore.getState().update("t1", { notes: "x" })).rejects.toThrow("nope");
    expect(useDispatchStore.getState().tasks[0].notes).toBe("");
  });
});

describe("remove", () => {
  it("refuses a conversation whose turn is working, and deletes nothing", async () => {
    useDispatchStore.setState({ tasks: [task({ status: "running" })] });
    await expect(useDispatchStore.getState().remove("t1")).rejects.toThrow("Stop the conversation");
    expect(deleteDispatchTask).not.toHaveBeenCalled();
    expect(useDispatchStore.getState().tasks).toHaveLength(1);
  });

  it("removes a finished conversation and its session", async () => {
    useDispatchStore.setState({ tasks: [task({ status: "done" })] });
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "x",
          messages: [],
          contextChars: 0,
          createdAt: 0,
          updatedAt: 0,
          pinned: false,
          kind: "dispatch",
        },
      ],
    });
    deleteDispatchTask.mockResolvedValue(undefined);

    await useDispatchStore.getState().remove("t1");

    expect(deleteDispatchTask).toHaveBeenCalledWith("t1");
    expect(useDispatchStore.getState().tasks).toEqual([]);
    expect(useChatStore.getState().sessions).toEqual([]);
  });
});
