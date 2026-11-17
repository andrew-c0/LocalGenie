import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useModelStore } from "../../stores/modelStore";
import { useToolApprovalStore } from "../../stores/toolApprovalStore";
import { useToolStore } from "../../stores/toolStore";
import type {
  ChatSession,
  ChatToolCall,
  DispatchPatch,
  DispatchTask,
  Message,
  ModelInfo,
  ToolDefinition,
  ToolSpec,
} from "../../types";
import { REPEAT_NUDGE_TEXT } from "../../utils/dispatchGuards";
import { DISPATCH_BLOCK_ID, NOTES_HEADING } from "../../utils/dispatchPrompt";
import type { TurnEnd } from "../../utils/dispatchTask";
import type { ToolState } from "../../utils/toolAccess";
import type { ModelRun, SendFailure } from "../chatRun";
import type { ChatMessage } from "../geniex";
import { continueTask, sendMessage, stopTask, turnBlockReason } from "./index";

// The service boundary: the conversations live in this fake table, updated the way the backend does.
let savedTasks: DispatchTask[] = [];
const dispatchUpdate = vi.fn();
vi.mock("../dispatch", () => ({
  listDispatchTasks: () => Promise.resolve(savedTasks),
  createDispatchTask: () => Promise.reject(new Error("not used")),
  updateDispatchTask: (id: string, patch: DispatchPatch) => dispatchUpdate(id, patch),
  deleteDispatchTask: () => Promise.resolve(),
}));

const resolveModelRun = vi.fn();
const streamReply = vi.fn();
const showChatError = vi.fn();
vi.mock("../chatRun", () => ({
  resolveModelRun: () => resolveModelRun(),
  streamReply: (...args: unknown[]) => streamReply(...args),
  showChatError: (...args: unknown[]) => showChatError(...args),
}));

// The history is the stored messages in order, so a test can compare what two requests sent.
vi.mock("../chatHistory", () => ({
  historyFor: (messages: Message[]) =>
    Promise.resolve({
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      unavailable: [],
    }),
  warnUnavailable: () => undefined,
}));

vi.mock("../chatCompaction", () => ({
  summariseConversation: () => Promise.resolve({ status: "skipped" }),
  stopSummary: () => Promise.resolve(),
}));

vi.mock("../compaction", () => ({
  getCompactionSettings: () => Promise.resolve({ enabled: false, thresholdPercent: 70 }),
}));

vi.mock("../database", () => ({
  saveMessage: () => Promise.resolve(),
  setPreference: () => Promise.resolve(),
}));

let endWriteFailure: Error | null = null;
vi.mock("./records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./records")>();
  return {
    ...actual,
    recordEnd: (taskId: string, end: TurnEnd) => {
      if (endWriteFailure) return Promise.reject(endWriteFailure);
      return actual.recordEnd(taskId, end);
    },
  };
});

const cancelChatCompletion = vi.fn(() => Promise.resolve());
vi.mock("../geniex", () => ({
  cancelChatCompletion: () => cancelChatCompletion(),
}));

// The tool itself: the real tool loop runs each call through this executor.
const executeTool = vi.fn();
vi.mock("../tools", () => ({
  executeTool: (...args: unknown[]) => executeTool(...args),
}));

vi.mock("../models", () => ({
  loadModelCapabilities: () => Promise.resolve([]),
}));

const activateModelMock = vi.fn();
vi.mock("../modelLoad", () => ({
  activateModel: (name: string) => activateModelMock(name),
}));

const notifyIfHidden = vi.fn();
vi.mock("../trayStatus", () => ({
  notifyIfHidden: (title: string, body: string) => notifyIfHidden(title, body),
}));

const READ_SPEC: ToolSpec = {
  id: "read_text_file",
  name: "read_text_file",
  description: "Read a file",
  parameters: {},
  risk: "read",
  source: "native",
};

const FETCH_SPEC: ToolSpec = {
  id: "web_fetch",
  name: "web_fetch",
  description: "Fetch a page",
  parameters: {},
  risk: "network",
  source: "native",
};

const LIST_SPEC: ToolSpec = {
  id: "list_directory",
  name: "list_directory",
  description: "List a folder",
  parameters: {},
  risk: "read",
  source: "native",
};

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

function dispatchSession(id: string): ChatSession {
  return {
    id,
    title: "Read the notes",
    messages: [],
    contextChars: 0,
    createdAt: 0,
    updatedAt: 0,
    pinned: false,
    kind: "dispatch",
  };
}

/** One scripted request: the messages it adds to the session it runs in, and a failure it may return. */
type Step = (sessionId: string) => unknown;

/** True for a step's result that is a failed request rather than nothing. */
function isFailure(value: unknown): value is SendFailure {
  return typeof value === "object" && value !== null && "error" in value;
}

/** A scripted model reply: a tool call or text, or both. */
function reply(calls: ChatToolCall[], text = ""): Step {
  return (sessionId) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      timestamp: Date.now(),
      toolCalls: calls.length > 0 ? calls : undefined,
    };
    useChatStore.getState().addMessage(sessionId, message);
  };
}

/** A reply that waits until the test releases it, so a turn can be seen while it runs. */
function heldReply(text: string): { step: Step; release: () => void } {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return {
    step: async (sessionId) => {
      await opened;
      reply([], text)(sessionId);
    },
    release: () => release(),
  };
}

function call(name: string, args: Record<string, string>): ChatToolCall {
  return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
}

let script: Step[] = [];
let runs: ModelRun[] = [];
let histories: ChatMessage[][] = [];
let offered: (ToolDefinition[] | undefined)[] = [];
let requestedSessions: string[] = [];

/** Lets every conversation's turn end: none is working, waiting for approval or queued, and no turn holds the model. */
async function settle(): Promise<void> {
  await vi.waitFor(() => {
    expect(
      savedTasks.some(
        (item) =>
          item.status === "running" || item.status === "needs_you" || item.status === "queued",
      ),
    ).toBe(false);
  });
  expect(useDispatchStore.getState().runningTaskId).toBeNull();
}

function savedTask(taskId = "t1"): DispatchTask {
  const found = savedTasks.find((item) => item.id === taskId);
  if (!found) throw new Error("no task");
  return found;
}

function messagesOf(sessionId: string): Message[] {
  return useChatStore.getState().sessions.find((s) => s.id === sessionId)?.messages ?? [];
}

function toolRowsOf(sessionId: string): Message[] {
  return messagesOf(sessionId).filter((m) => m.role === "tool");
}

function lastToolRow(sessionId: string): Message | undefined {
  const rows = toolRowsOf(sessionId);
  return rows[rows.length - 1];
}

function installed(name: string): ModelInfo {
  return { name, size: "1 GB", source: "localfs", precisions: [] };
}

/** Records the model a conversation's session ran on, as the runner does at each turn start. */
function recordModelOn(sessionId: string, modelId: string): void {
  useChatStore.setState((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === sessionId ? { ...session, modelId } : session,
    ),
  }));
}

/**
 * Sets up the conversations: one per override, numbered from t1 with its session s1. The default is one
 * queued conversation.
 */
function setUp(...overrides: Partial<DispatchTask>[]): void {
  const list = overrides.length > 0 ? overrides : [{}];
  savedTasks = list.map((override, index) =>
    task({ id: `t${index + 1}`, sessionId: `s${index + 1}`, ...override }),
  );
  useDispatchStore.setState({
    tasks: [...savedTasks],
    loaded: true,
    loadError: null,
    runningTaskId: null,
  });
  useChatStore.setState({
    sessions: savedTasks.map((item) => dispatchSession(item.sessionId)),
    activeSessionId: null,
    isStreaming: false,
    compacting: false,
    activeStream: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  endWriteFailure = null;
  script = [];
  runs = [];
  histories = [];
  offered = [];
  requestedSessions = [];
  useModelStore.setState({
    activeModelId: "m",
    models: [installed("m"), installed("other")],
    serverStatus: { running: true, port: 8080, models: ["m"] },
  });
  activateModelMock.mockImplementation((name: string) => {
    useModelStore.setState({ activeModelId: name });
    return Promise.resolve({ compute: null });
  });
  useToolStore.setState({
    tools: [READ_SPEC],
    states: { read_text_file: "on" },
    dispatchStates: {},
    chatDisabled: {},
    chatGrants: {},
    enabledSearchSources: [],
    searchSources: [],
    allowedFolders: [],
  });
  for (const item of useToolApprovalStore.getState().pending) {
    useToolApprovalStore.getState().resolveApproval(item.request.id, "cancel");
  }
  resolveModelRun.mockImplementation(() =>
    Promise.resolve({
      modelId: useModelStore.getState().activeModelId,
      settings: {},
      load: {},
      systemBlocks: [],
      contextWindow: null,
    }),
  );
  streamReply.mockImplementation(
    async (sessionId: string, history: ChatMessage[], run: ModelRun, tools?: ToolDefinition[]) => {
      runs.push(run);
      histories.push(history);
      offered.push(tools);
      requestedSessions.push(sessionId);
      const result = await script.shift()?.(sessionId);
      return isFailure(result) ? result : null;
    },
  );
  executeTool.mockResolvedValue({
    ok: true,
    content: "file text",
    truncated: false,
    durationMs: 1,
  });
  dispatchUpdate.mockImplementation((id: string, patch: DispatchPatch) => {
    const current = savedTasks.find((item) => item.id === id);
    if (!current) return Promise.reject(new Error("no task"));
    const next = { ...current, ...patch };
    savedTasks = savedTasks.map((item) => (item.id === id ? next : item));
    return Promise.resolve(next);
  });
});

describe("sendMessage", () => {
  it("stores the message, runs the turn and ends it ready with the reply", async () => {
    setUp();
    script = [reply([call("read_text_file", { path: "a.txt" })]), reply([], "All done.")];

    await sendMessage("t1", "  Read the notes  ");
    await settle();

    expect(savedTask()).toMatchObject({ status: "done", report: "All done.", steps: 2 });
    expect(messagesOf("s1")[0]).toMatchObject({ role: "user", content: "Read the notes" });
    expect(toolRowsOf("s1").map((m) => m.content)).toEqual(["file text"]);
    expect(notifyIfHidden).toHaveBeenCalledWith("Dispatch replied", "All done.");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("gives a user message no approval: only tool results carry one", async () => {
    setUp();
    script = [reply([], "ok")];
    await sendMessage("t1", "hello");
    await settle();
    const userMsg = messagesOf("s1").find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg && "approval" in userMsg).toBe(false);
  });

  it("runs sixty tool rounds with no step cap before the reply ends the turn", async () => {
    setUp();
    script = [
      ...Array.from({ length: 60 }, (_, i) => reply([call("read_text_file", { path: `f${i}` })])),
      reply([], "Finished after sixty rounds."),
    ];

    await sendMessage("t1", "Go through the folder");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(61);
    expect(savedTask()).toMatchObject({ status: "done", steps: 61 });
    expect(savedTask().error).toBeNull();
    expect(notifyIfHidden).toHaveBeenCalledWith("Dispatch replied", "Finished after sixty rounds.");
  });

  it("ends the turn at once on a reply with no tool call, with no nudge", async () => {
    setUp();
    script = [reply([], "Only text.")];
    await sendMessage("t1", "hi");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(1);
    expect(savedTask()).toMatchObject({ status: "done", report: "Only text." });
    const userMessages = messagesOf("s1").filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
  });

  it("runs the same call up to three times in a row: the guard acts on the fourth", async () => {
    setUp();
    const same = () => reply([call("read_text_file", { path: "a.txt" })]);
    script = [same(), same(), same(), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(savedTask()).toMatchObject({ status: "done" });
  });

  it("ends with the no-text line when the reply is empty, and says so in the notice", async () => {
    setUp();
    script = [reply([], "   ")];
    await sendMessage("t1", "hi");
    await settle();
    expect(savedTask()).toMatchObject({ status: "done", report: "" });
    expect(notifyIfHidden).toHaveBeenCalledWith("Dispatch replied", "The reply has no text.");
  });

  it("gives each request the static Dispatch prompt block, with no goal and no notes", async () => {
    setUp({ notes: "plan: read" });
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();

    const blocks = runs[0].systemBlocks;
    const dispatchBlock = blocks[blocks.length - 1];
    expect(dispatchBlock).toMatchObject({ id: DISPATCH_BLOCK_ID, kind: "text" });
    expect(dispatchBlock.kind === "text" && dispatchBlock.text).not.toContain("plan: read");
    expect(dispatchBlock.kind === "text" && dispatchBlock.text).not.toContain("Goal:");
  });

  it("saves dispatch_notes and sends the new notes on the next request, not in the system prompt", async () => {
    setUp();
    script = [reply([call("dispatch_notes", { text: "1. read the file" })]), reply([], "done")];
    await sendMessage("t1", "plan it");
    await settle();

    expect(savedTask().notes).toBe("1. read the file");
    expect(toolRowsOf("s1")[0]?.content).toBe("Notes saved.");
    const lastHistoryMessage = histories[1][histories[1].length - 1];
    expect(lastHistoryMessage).toMatchObject({ role: "user" });
    expect(lastHistoryMessage.content).toBe(`${NOTES_HEADING}\n1. read the file`);
    const systemText = JSON.stringify(runs[1].systemBlocks);
    expect(systemText).not.toContain("1. read the file");
  });

  it("fails the turn with the stream's error and shows it in the transcript", async () => {
    setUp();
    script = [() => ({ error: "The server closed." })];
    await sendMessage("t1", "hi");
    await settle();

    expect(savedTask()).toMatchObject({ status: "failed", error: "The server closed." });
    expect(showChatError).toHaveBeenCalledTimes(1);
    expect(showChatError).toHaveBeenCalledWith("s1", { error: "The server closed." });
    expect(notifyIfHidden).toHaveBeenCalledWith(
      "Dispatch replied",
      "Dispatch stopped: The server closed.",
    );
  });

  it("fails the turn when the loaded model changes, and shows the error once", async () => {
    setUp();
    script = [
      (sessionId) => {
        reply([call("read_text_file", { path: "a" })])(sessionId);
        useModelStore.setState({ activeModelId: "other" });
      },
    ];
    await sendMessage("t1", "hi");
    await settle();

    expect(savedTask()).toMatchObject({ status: "failed" });
    expect(savedTask().error).toBe(
      "The loaded model changed from m to other. The conversation needs the model it started with.",
    );
    expect(showChatError).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty message, and refuses with no model loaded, leaving the conversation as it was", async () => {
    setUp();
    await expect(sendMessage("t1", "   ")).rejects.toThrow("Type a message");

    useModelStore.setState({ activeModelId: null });
    await expect(sendMessage("t1", "hi")).rejects.toThrow("Load a model");
    expect(savedTask().status).toBe("queued");
    expect(messagesOf("s1")).toEqual([]);
    expect(streamReply).not.toHaveBeenCalled();
  });

  it("accepts a message for a conversation that has finished, which continues it", async () => {
    setUp({ status: "done" });
    script = [reply([], "Second answer.")];
    await sendMessage("t1", "and then?");
    await settle();
    expect(savedTask()).toMatchObject({ status: "done", report: "Second answer." });
    expect(messagesOf("s1").map((m) => m.content)).toEqual(["and then?", "Second answer."]);
  });
});

describe("tool offering", () => {
  it("offers a tool that is On and switched on for the conversation, plus the notes tool", async () => {
    setUp();
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual([
      "read_text_file",
      "dispatch_notes",
    ]);
  });

  it("leaves out a tool the conversation has switched off, even when it is On", async () => {
    setUp();
    useToolStore.getState().setChatToolEnabled("s1", "read_text_file", false);
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual(["dispatch_notes"]);
  });

  it("offers a Request approval tool, and a tool that is Off in chat, since Dispatch is On by default", async () => {
    setUp();
    useToolStore.setState({
      tools: [READ_SPEC, FETCH_SPEC, LIST_SPEC],
      states: { read_text_file: "on", web_fetch: "ask", list_directory: "off" },
    });
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual([
      "read_text_file",
      "web_fetch",
      "list_directory",
      "dispatch_notes",
    ]);
  });

  it("returns an off result, and runs nothing, for a call the conversation has switched off", async () => {
    setUp();
    useToolStore.getState().setChatToolEnabled("s1", "read_text_file", false);
    script = [reply([call("read_text_file", { path: "a" })]), reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();

    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRowsOf("s1")[0]?.content).toBe("This tool is turned off.");
  });
});

describe("one turn at a time", () => {
  it("refuses a message to a conversation that is working, and stores nothing", async () => {
    setUp();
    const held = heldReply("first");
    script = [held.step];
    await sendMessage("t1", "first");
    await vi.waitFor(() => expect(savedTask().status).toBe("running"));

    await expect(sendMessage("t1", "again")).rejects.toThrow("This conversation is working");
    expect(messagesOf("s1").filter((m) => m.role === "user")).toHaveLength(1);

    held.release();
    await settle();
    expect(savedTask()).toMatchObject({ status: "done" });
  });

  it("queues a message sent while another conversation runs, and runs the queue first in, first out", async () => {
    setUp({}, {}, {});
    const first = heldReply("A1");
    script = [first.step, reply([], "A2"), reply([], "A3")];

    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");
    await sendMessage("t3", "three");

    expect(savedTask("t2").status).toBe("queued");
    expect(savedTask("t3").status).toBe("queued");
    expect(useDispatchStore.getState().runningTaskId).toBe("t1");
    expect(streamReply).toHaveBeenCalledTimes(1);

    first.release();
    await settle();

    expect(requestedSessions).toEqual(["s1", "s2", "s3"]);
    expect(savedTasks.map((item) => item.status)).toEqual(["done", "done", "done"]);
    expect(messagesOf("s2").map((m) => m.content)).toEqual(["two", "A2"]);
    expect(messagesOf("s3").map((m) => m.content)).toEqual(["three", "A3"]);
  });

  it("refuses a second message to a conversation that is already queued", async () => {
    setUp({}, {});
    const first = heldReply("A1");
    script = [first.step, reply([], "A2")];
    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");

    expect(turnBlockReason("t2")).toBe(
      "This conversation is queued. It starts when the running one finishes.",
    );
    await expect(sendMessage("t2", "again")).rejects.toThrow("This conversation is queued");

    first.release();
    await settle();
    expect(messagesOf("s2").filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("marks a queued conversation stopped without running it, and runs the rest", async () => {
    setUp({}, {}, {});
    const first = heldReply("A1");
    script = [first.step, reply([], "A3")];
    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");
    await sendMessage("t3", "three");

    await stopTask("t2");
    expect(savedTask("t2").status).toBe("stopped");

    first.release();
    await settle();
    expect(requestedSessions).toEqual(["s1", "s3"]);
    expect(savedTask("t3").status).toBe("done");
  });

  it("fails a queued conversation that cannot run on the server now, and does not block the rest", async () => {
    setUp({}, {});
    const first = heldReply("A1");
    script = [first.step];
    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");

    useModelStore.setState({ serverStatus: { running: false, port: 8080, models: [] } });
    first.release();
    await settle();

    expect(requestedSessions).toEqual(["s1"]);
    expect(savedTask("t2")).toMatchObject({
      status: "failed",
      error: "Start the GenieX server to run a conversation.",
    });
    expect(showChatError).toHaveBeenCalledWith("s2", {
      error: "Start the GenieX server to run a conversation.",
    });
  });
});

describe("turnBlockReason", () => {
  it("is null for a new conversation when the chat and the model are free", () => {
    setUp();
    expect(turnBlockReason(null)).toBeNull();
  });

  it("waits while a chat reply runs", () => {
    setUp();
    useChatStore.setState({ isStreaming: true });
    expect(turnBlockReason("t1")).toBe("Wait for the chat reply to finish before sending.");
    useChatStore.setState({ isStreaming: false });
  });

  it("does not block on the Dispatch turn's own streaming", async () => {
    setUp({}, { status: "done" });
    const first = heldReply("A1");
    script = [first.step];
    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    useChatStore.setState({ isStreaming: true });

    expect(turnBlockReason("t2")).toBeNull();

    useChatStore.setState({ isStreaming: false });
    first.release();
    await settle();
  });
});

describe("stopTask", () => {
  it("ends a running turn as stopped, cancels its call, and sends no notice", async () => {
    setUp();
    script = [
      (sessionId) => {
        reply([call("read_text_file", { path: "a" })])(sessionId);
        void stopTask("t1");
      },
    ];
    await sendMessage("t1", "read");
    await settle();

    expect(savedTask()).toMatchObject({ status: "stopped" });
    expect(cancelChatCompletion).toHaveBeenCalled();
    expect(notifyIfHidden).not.toHaveBeenCalled();
    expect(lastToolRow("s1")?.content).toBe("The user stopped this call.");
    expect(streamReply).toHaveBeenCalledTimes(1);
  });
});

describe("continueTask", () => {
  it("continues a stopped conversation from its stored messages, without adding the message again", async () => {
    setUp({ status: "stopped" });
    useChatStore.getState().addMessage("s1", {
      id: "g",
      role: "user",
      content: "Read the notes",
      timestamp: 1,
    });
    script = [reply([], "Resumed.")];

    await continueTask("t1");
    await settle();

    expect(savedTask()).toMatchObject({ status: "done", report: "Resumed." });
    expect(messagesOf("s1").filter((m) => m.content === "Read the notes")).toHaveLength(1);
  });

  it("refuses to continue a conversation that is not stopped or interrupted", async () => {
    setUp({ status: "done" });
    await expect(continueTask("t1")).rejects.toThrow("Only a stopped or interrupted conversation");
  });
});

describe("tool calls of one reply", () => {
  it("runs every call of a reply in order, with no per-reply cap", async () => {
    setUp();
    const calls = Array.from({ length: 6 }, (_, i) => call("read_text_file", { path: `f${i}` }));
    script = [reply(calls), reply([], "done")];
    await sendMessage("t1", "read them all");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(6);
    const rows = toolRowsOf("s1");
    expect(rows.map((row) => row.toolRecord?.callId)).toEqual(calls.map((item) => item.id));
    expect(rows.every((row) => row.toolRecord?.status === "ok")).toBe(true);
    expect(savedTask()).toMatchObject({ status: "done", report: "done" });
  });
});

describe("the model a conversation ran on", () => {
  it("records the loaded model in the conversation's session at the start of its turn", async () => {
    setUp();
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();

    expect(useChatStore.getState().sessions.find((s) => s.id === "s1")?.modelId).toBe("m");
    expect(activateModelMock).not.toHaveBeenCalled();
  });

  it("loads a queued conversation's own model before its turn starts", async () => {
    setUp({}, {});
    recordModelOn("s2", "other");
    const first = heldReply("A1");
    script = [first.step, reply([], "B2")];

    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");
    first.release();
    await settle();

    expect(activateModelMock).toHaveBeenCalledWith("other");
    expect(requestedSessions).toEqual(["s1", "s2"]);
    expect(runs[1].modelId).toBe("other");
    expect(savedTask("t2")).toMatchObject({ status: "done", report: "B2" });
  });

  it("fails a queued conversation with the reason when its model cannot load, and runs the rest", async () => {
    setUp({}, {}, {});
    recordModelOn("s2", "other");
    const first = heldReply("A1");
    script = [first.step, reply([], "A3")];
    activateModelMock.mockImplementation((name: string) => {
      if (name === "other") return Promise.reject(new Error("out of memory"));
      useModelStore.setState({ activeModelId: name });
      return Promise.resolve({ compute: null });
    });

    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");
    await sendMessage("t3", "three");
    first.release();
    await settle();

    const reason = "Could not load other for this conversation: out of memory";
    expect(savedTask("t2")).toMatchObject({ status: "failed", error: reason });
    expect(showChatError).toHaveBeenCalledWith("s2", { error: reason });
    expect(requestedSessions).toEqual(["s1", "s3"]);
    expect(savedTask("t3").status).toBe("done");
  });

  it("fails a queued conversation whose recorded model is no longer installed", async () => {
    setUp({}, {});
    recordModelOn("s2", "gone");
    const first = heldReply("A1");
    script = [first.step];

    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await sendMessage("t2", "two");
    first.release();
    await settle();

    expect(savedTask("t2")).toMatchObject({
      status: "failed",
      error: "gone is no longer installed, so this conversation cannot continue on it.",
    });
    expect(activateModelMock).not.toHaveBeenCalled();
  });

  it("continues an interrupted conversation on its recorded model, and leaves it interrupted when that model cannot load", async () => {
    setUp({ status: "interrupted" });
    recordModelOn("s1", "other");
    activateModelMock.mockImplementation(() => Promise.reject(new Error("no disk")));

    await expect(continueTask("t1")).rejects.toThrow(
      "Could not load other for this conversation: no disk",
    );
    expect(savedTask("t1").status).toBe("interrupted");
    expect(streamReply).not.toHaveBeenCalled();
    expect(useDispatchStore.getState().runningTaskId).toBeNull();
  });

  it("continues an interrupted conversation by loading its recorded model first", async () => {
    setUp({ status: "interrupted" });
    recordModelOn("s1", "other");
    script = [reply([], "Back on the other model.")];

    await continueTask("t1");
    await settle();

    expect(activateModelMock).toHaveBeenCalledWith("other");
    expect(runs[0].modelId).toBe("other");
    expect(savedTask("t1")).toMatchObject({ status: "done" });
  });
});

describe("continuing while another turn runs", () => {
  it("queues an interrupted conversation behind the running turn instead of refusing", async () => {
    setUp({}, { status: "interrupted" });
    const first = heldReply("A1");
    script = [first.step, reply([], "B1")];

    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    await expect(continueTask("t2")).resolves.toBeUndefined();
    expect(savedTask("t2").status).toBe("queued");

    first.release();
    await settle();
    expect(requestedSessions).toEqual(["s1", "s2"]);
    expect(savedTask("t2")).toMatchObject({ status: "done", report: "B1" });
  });
});

describe("a start while the recorded model loads", () => {
  it("shows the conversation as running while its model loads, so the chat input stays off", async () => {
    setUp({ status: "interrupted" });
    recordModelOn("s1", "other");
    let finishLoad: () => void = () => undefined;
    const loading = new Promise<{ compute: null }>((resolve) => {
      finishLoad = () => {
        useModelStore.setState({ activeModelId: "other" });
        resolve({ compute: null });
      };
    });
    activateModelMock.mockImplementation(() => loading);
    script = [reply([], "Loaded and done.")];

    const started = continueTask("t1");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("running"));
    expect(useDispatchStore.getState().runningTaskId).toBe("t1");

    finishLoad();
    await started;
    await settle();
    expect(savedTask("t1")).toMatchObject({ status: "done", report: "Loaded and done." });
  });
});

describe("continuing with the server stopped", () => {
  const stoppedServer = { running: false, port: 8080, models: [] };

  it("starts the server, loads the recorded model, then runs the conversation", async () => {
    setUp({ status: "interrupted" });
    recordModelOn("s1", "other");
    useModelStore.setState({ activeModelId: null, serverStatus: stoppedServer });
    activateModelMock.mockImplementation((name: string) => {
      useModelStore.setState({
        activeModelId: name,
        serverStatus: { running: true, port: 8080, models: [name] },
      });
      return Promise.resolve({ compute: null });
    });
    script = [reply([], "Started and answered.")];

    await continueTask("t1");
    await settle();

    expect(activateModelMock).toHaveBeenCalledWith("other");
    expect(useModelStore.getState().serverStatus.running).toBe(true);
    expect(savedTask("t1")).toMatchObject({ status: "done", report: "Started and answered." });
  });

  it("leaves the conversation interrupted, with the reason, when the server cannot start", async () => {
    setUp({ status: "interrupted" });
    recordModelOn("s1", "other");
    useModelStore.setState({ activeModelId: null, serverStatus: stoppedServer });
    activateModelMock.mockImplementation(() => Promise.reject(new Error("port 8080 is in use")));

    await expect(continueTask("t1")).rejects.toThrow(
      "Could not load other for this conversation: port 8080 is in use",
    );
    expect(savedTask("t1").status).toBe("interrupted");
    expect(streamReply).not.toHaveBeenCalled();
  });

  it("still refuses a conversation with no recorded model while the server is stopped", async () => {
    setUp({ status: "interrupted" });
    useModelStore.setState({ activeModelId: null, serverStatus: stoppedServer });

    await expect(continueTask("t1")).rejects.toThrow(
      "Start the GenieX server to run a conversation.",
    );
  });
});

describe("Dispatch tool states", () => {
  it("offers a tool whose Dispatch state is On even when its chat state is Off", async () => {
    setUp();
    useToolStore.setState({
      states: { read_text_file: "off" },
      dispatchStates: { read_text_file: "on" },
    });
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual([
      "read_text_file",
      "dispatch_notes",
    ]);
  });

  it("leaves out a tool whose Dispatch state is Off, even when its chat state is On", async () => {
    setUp();
    useToolStore.setState({
      states: { read_text_file: "on" },
      dispatchStates: { read_text_file: "off" },
    });
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual(["dispatch_notes"]);
  });

  it("is On in Dispatch while the tool has no Dispatch state, whatever its chat state is", async () => {
    setUp();
    useToolStore.setState({ states: { read_text_file: "off" }, dispatchStates: {} });
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect((offered[0] ?? []).map((tool) => tool.function.name)).toEqual([
      "read_text_file",
      "dispatch_notes",
    ]);
  });

  it("runs a call by the Dispatch state: an Off Dispatch state refuses it though the chat has it On", async () => {
    setUp();
    useToolStore.setState({
      states: { read_text_file: "on" },
      dispatchStates: { read_text_file: "off" },
    });
    script = [reply([call("read_text_file", { path: "a" })]), reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();
    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRowsOf("s1")[0]?.content).toBe("This tool is turned off.");
  });
});

describe("Request approval in Dispatch", () => {
  /** A conversation whose web_fetch is set to Request approval in Dispatch; read_text_file is On. */
  function askSetUp(...overrides: Partial<DispatchTask>[]): void {
    setUp(...(overrides.length > 0 ? overrides : [{}]));
    useToolStore.setState({
      tools: [READ_SPEC, FETCH_SPEC],
      states: { read_text_file: "on", web_fetch: "ask" },
      dispatchStates: { read_text_file: "on", web_fetch: "ask" },
    });
  }

  /** Waits for the one open approval question and returns its id. */
  async function waitForApproval(): Promise<string> {
    await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
    const request = useToolApprovalStore.getState().pending[0]?.request;
    if (!request) throw new Error("no approval");
    return request.id;
  }

  function answer(id: string, decision: "once" | "chat" | "deny"): void {
    useToolApprovalStore.getState().resolveApproval(id, decision);
  }

  /** The statuses a conversation was written with, in order. */
  function statusWrites(taskId: string): unknown[] {
    return dispatchUpdate.mock.calls
      .filter(([id, patch]) => id === taskId && (patch as DispatchPatch).status !== undefined)
      .map(([, patch]) => (patch as DispatchPatch).status);
  }

  it("offers the approval question through the chat's dialog, and runs the call once it is approved", async () => {
    askSetUp();
    script = [reply([call("web_fetch", { url: "https://a.example" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");

    const id = await waitForApproval();
    expect(useToolApprovalStore.getState().pending[0]?.request).toMatchObject({
      sessionId: "s1",
      toolName: "web_fetch",
      arguments: '{"url":"https://a.example"}',
    });
    answer(id, "once");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolRowsOf("s1")[0]?.toolRecord).toMatchObject({ status: "ok", approval: "once" });
    expect(savedTask()).toMatchObject({ status: "done", report: "done" });
  });

  it("denies: the model gets the denied result and the turn goes on", async () => {
    askSetUp();
    script = [reply([call("web_fetch", { url: "https://a.example" })]), reply([], "carried on")];
    await sendMessage("t1", "fetch it");

    answer(await waitForApproval(), "deny");
    await settle();

    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRowsOf("s1")[0]).toMatchObject({
      content: "The user denied this call.",
      toolRecord: { status: "denied" },
    });
    expect(streamReply).toHaveBeenCalledTimes(2);
    expect(savedTask()).toMatchObject({ status: "done", report: "carried on" });
  });

  it("allow for this conversation skips the second prompt for the same tool", async () => {
    askSetUp();
    script = [
      reply([call("web_fetch", { url: "https://a" })]),
      reply([call("web_fetch", { url: "https://b" })]),
      reply([], "done"),
    ];
    await sendMessage("t1", "fetch both");

    answer(await waitForApproval(), "chat");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(useToolStore.getState().hasChatGrant("s1", "web_fetch")).toBe(true);
    const approvalNotices = notifyIfHidden.mock.calls.filter(
      ([title]) => title === "Dispatch needs your approval",
    );
    expect(approvalNotices).toHaveLength(1);
    expect(toolRowsOf("s1").map((row) => row.toolRecord?.approval)).toEqual(["chat", "chat"]);
  });

  it("stop while waiting cancels the question, ends the call as cancelled and the turn as stopped", async () => {
    askSetUp();
    script = [reply([call("web_fetch", { url: "https://a" })])];
    await sendMessage("t1", "fetch it");
    await waitForApproval();

    await stopTask("t1");
    await settle();

    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRowsOf("s1")[0]?.toolRecord?.status).toBe("cancelled");
    expect(savedTask()).toMatchObject({ status: "stopped" });
    expect(streamReply).toHaveBeenCalledTimes(1);
  });

  it("shows Needs you while it waits, keeps the model locked and queues the next conversation, then runs again", async () => {
    askSetUp({}, {});
    script = [
      reply([call("web_fetch", { url: "https://a" })]),
      reply([], "A done"),
      reply([], "B"),
    ];
    await sendMessage("t1", "one");
    await vi.waitFor(() => expect(savedTask("t1").status).toBe("needs_you"));
    await sendMessage("t2", "two");

    expect(useDispatchStore.getState().runningTaskId).toBe("t1");
    expect(savedTask("t2").status).toBe("queued");

    answer(await waitForApproval(), "once");
    await settle();

    expect(statusWrites("t1")).toEqual(["running", "needs_you", "running", "done"]);
    expect(requestedSessions).toEqual(["s1", "s1", "s2"]);
    expect(savedTask("t2")).toMatchObject({ status: "done", report: "B" });
  });

  it("notifies when the question opens, naming the tool and the conversation", async () => {
    askSetUp();
    script = [reply([call("web_fetch", { url: "https://a" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");

    answer(await waitForApproval(), "once");
    await settle();

    expect(notifyIfHidden).toHaveBeenCalledWith(
      "Dispatch needs your approval",
      "Fetched page in Read the notes",
    );
  });

  it("does not ask for a tool that is On: it runs at once", async () => {
    askSetUp();
    script = [reply([call("read_text_file", { path: "a" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(notifyIfHidden).not.toHaveBeenCalledWith(
      "Dispatch needs your approval",
      expect.anything(),
    );
    expect(toolRowsOf("s1")[0]?.toolRecord?.approval).toBe("auto");
  });
});

describe("which state decides a Dispatch call", () => {
  const FETCH_NAME = "web_fetch";

  /** Sets the chat state of web_fetch, and the Dispatch state through the store's own action when given. */
  async function fetchStates(chat: ToolState, dispatch?: ToolState): Promise<void> {
    setUp();
    useToolStore.setState({
      tools: [FETCH_SPEC],
      states: { [FETCH_NAME]: chat },
      dispatchStates: {},
    });
    if (dispatch) await useToolStore.getState().setDispatchState(FETCH_NAME, dispatch);
  }

  it("(a) runs without asking when Dispatch is On in Settings, though the chat is Request approval", async () => {
    await fetchStates("ask", "on");
    script = [reply([call(FETCH_NAME, { url: "https://a.example" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");
    await settle();

    expect(offered[0]?.map((tool) => tool.function.name)).toContain(FETCH_NAME);
    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolRowsOf("s1")[0]?.toolRecord).toMatchObject({ status: "ok", approval: "auto" });
  });

  it("(b) runs without asking when Dispatch was never set and the chat state is On", async () => {
    await fetchStates("on");
    script = [reply([call(FETCH_NAME, { url: "https://a.example" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");
    await settle();

    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolRowsOf("s1")[0]?.toolRecord).toMatchObject({ status: "ok", approval: "auto" });
  });

  it("(c) runs without asking when Dispatch was never set, though the chat is Request approval", async () => {
    await fetchStates("ask");
    expect(useToolStore.getState().isToolEnabledInChat("s1", FETCH_NAME)).toBe(true);
    script = [reply([call(FETCH_NAME, { url: "https://a.example" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");
    await settle();

    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(toolRowsOf("s1")[0]?.toolRecord).toMatchObject({ status: "ok", approval: "auto" });
  });

  it("still asks when Dispatch is set to Request approval, whatever the chat state is", async () => {
    await fetchStates("on", "ask");
    script = [reply([call(FETCH_NAME, { url: "https://a.example" })]), reply([], "done")];
    await sendMessage("t1", "fetch it");

    await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
    const id = useToolApprovalStore.getState().pending[0]?.request.id ?? "";
    useToolApprovalStore.getState().resolveApproval(id, "once");
    await settle();
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("an explicit Dispatch Off wins over a chat state of On", async () => {
    await fetchStates("on", "off");
    script = [reply([call(FETCH_NAME, { url: "https://a.example" })]), reply([], "ok")];
    await sendMessage("t1", "fetch it");
    await settle();

    expect(offered[0]?.map((tool) => tool.function.name)).not.toContain(FETCH_NAME);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("(e) runs an MCP tool with no Dispatch state without asking, though its chat state is Request approval", async () => {
    const mcpName = "mcp__docs__read_file";
    const mcpSpec: ToolSpec = {
      id: mcpName,
      name: mcpName,
      description: "Read a file on the docs server",
      parameters: {},
      risk: "read",
      source: "mcp",
      serverId: "srv1",
      serverName: "docs",
    };
    setUp();
    useToolStore.setState({ tools: [mcpSpec], states: { [mcpName]: "ask" }, dispatchStates: {} });
    script = [reply([call(mcpName, { path: "a" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("(e) runs an MCP tool by its own name: Dispatch On beats a chat state of Request approval", async () => {
    const mcpName = "mcp__docs__read_file";
    const mcpSpec: ToolSpec = {
      id: mcpName,
      name: mcpName,
      description: "Read a file on the docs server",
      parameters: {},
      risk: "read",
      source: "mcp",
      serverId: "srv1",
      serverName: "docs",
    };
    setUp();
    useToolStore.setState({ tools: [mcpSpec], states: { [mcpName]: "ask" }, dispatchStates: {} });
    await useToolStore.getState().setDispatchState(mcpName, "on");
    script = [reply([call(mcpName, { path: "a" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(offered[0]?.map((tool) => tool.function.name)).toContain(mcpName);
    expect(useToolApprovalStore.getState().pending).toHaveLength(0);
    // No window is known in this test, so no result budget is sent.
    expect(executeTool).toHaveBeenCalledWith(
      mcpName,
      expect.anything(),
      [],
      expect.anything(),
      undefined,
    );
  });
});

describe("an empty model reply", () => {
  const EMPTY_TEXT =
    "The model returned an empty reply 3 times in a row. Send a message to continue, or try another model.";

  /** A request that adds nothing: the model sent no text and no tool call. */
  const empty: Step = () => undefined;

  it("sends the same step again, and carries on silently when the retry has a reply", async () => {
    setUp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    script = [empty, reply([], "Good reply.")];
    await sendMessage("t1", "hi");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(2);
    expect(savedTask()).toMatchObject({ status: "done", report: "Good reply.", steps: 1 });
    expect(messagesOf("s1").filter((m) => m.role === "user")).toHaveLength(1);
    expect(messagesOf("s1").some((m) => m.isError)).toBe(false);
    expect(showChatError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Step 1"));
    warn.mockRestore();
  });

  it("fails the turn with the message after three empty replies in a row", async () => {
    setUp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    script = [empty, empty, empty];
    await sendMessage("t1", "hi");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(3);
    expect(savedTask()).toMatchObject({ status: "failed", error: EMPTY_TEXT, steps: 1 });
    expect(showChatError).toHaveBeenCalledTimes(1);
    expect(showChatError).toHaveBeenCalledWith("s1", { error: EMPTY_TEXT });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("stops at once when Stop is pressed during a retry", async () => {
    setUp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    script = [
      empty,
      () => {
        void stopTask("t1");
      },
    ];
    await sendMessage("t1", "hi");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(2);
    expect(savedTask()).toMatchObject({ status: "stopped" });
    expect(showChatError).not.toHaveBeenCalled();
    expect(notifyIfHidden).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("retries after a tool result with the same history, and the next step gets the next number", async () => {
    setUp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    script = [reply([call("read_text_file", { path: "a" })]), empty, reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(streamReply).toHaveBeenCalledTimes(3);
    expect(savedTask()).toMatchObject({ status: "done", report: "done", steps: 2 });
    expect(toolRowsOf("s1")).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Step 2"));
    warn.mockRestore();
  });
});

describe("the message field after a turn", () => {
  it("frees the runner when writing the end throws, so the next conversation runs", async () => {
    setUp({}, {});
    endWriteFailure = new Error("The database is locked.");
    script = [reply([], "A1"), reply([], "B1")];
    await sendMessage("t1", "one");

    await vi.waitFor(() => expect(turnBlockReason("t1")).toBeNull());
    endWriteFailure = null;
    await sendMessage("t2", "two");

    await vi.waitFor(() => expect(messagesOf("s2").map((m) => m.content)).toEqual(["two", "B1"]));
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("is enabled when the end reaches the store after an approval, and the chat flags are clear", async () => {
    setUp();
    useToolStore.setState({
      tools: [FETCH_SPEC],
      states: { web_fetch: "ask" },
      dispatchStates: { web_fetch: "ask" },
    });
    const blockersAtEnd: (string | null)[] = [];
    const unsubscribe = useDispatchStore.subscribe((state) => {
      if (state.tasks.find((task) => task.id === "t1")?.status === "done") {
        blockersAtEnd.push(turnBlockReason("t1"));
      }
    });
    script = [reply([call("web_fetch", { url: "https://a.example" })]), reply([], "Answer.")];
    await sendMessage("t1", "fetch it");
    await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
    const id = useToolApprovalStore.getState().pending[0]?.request.id ?? "";
    useToolApprovalStore.getState().resolveApproval(id, "once");
    await settle();
    unsubscribe();

    expect(savedTask()).toMatchObject({ status: "done", report: "Answer." });
    expect(blockersAtEnd.length).toBeGreaterThan(0);
    expect(blockersAtEnd.every((blocker) => blocker === null)).toBe(true);
    expect(turnBlockReason("t1")).toBeNull();
    const chat = useChatStore.getState();
    expect([chat.isStreaming, chat.compacting, chat.activeStream]).toEqual([false, false, null]);
  });
});

describe("a message after the model unloaded", () => {
  it("sends to a conversation with a recorded model, loading that model first", async () => {
    setUp();
    recordModelOn("s1", "other");
    useModelStore.setState({
      activeModelId: null,
      serverStatus: { running: true, port: 8080, models: [] },
    });
    expect(turnBlockReason("t1")).toBeNull();
    activateModelMock.mockImplementation((name: string) => {
      useModelStore.setState({
        activeModelId: name,
        serverStatus: { running: true, port: 8080, models: [name] },
      });
      return Promise.resolve({ compute: null });
    });
    script = [reply([], "Back.")];

    await sendMessage("t1", "again");
    await settle();

    expect(activateModelMock).toHaveBeenCalledWith("other");
    expect(savedTask()).toMatchObject({ status: "done", report: "Back." });
  });

  it("still asks for a model when the conversation has none recorded", () => {
    setUp();
    useModelStore.setState({ activeModelId: null });
    expect(turnBlockReason("t1")).toBe("Load a model to run a conversation.");
  });
});

/** A scripted reply with its usage and time, as the chat stores them when the stream ends. */
function timedReply(
  calls: ChatToolCall[],
  text: string,
  usage: { promptTokens: number; completionTokens: number },
  totalTime: number,
): Step {
  return (sessionId) => {
    useChatStore.getState().addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      timestamp: Date.now(),
      toolCalls: calls.length > 0 ? calls : undefined,
      usage,
      stats: {
        timeToFirstToken: 100,
        totalTime,
        tokenCount: usage.completionTokens,
        promptChars: 10,
      },
    });
  };
}

/** The console.info calls whose first argument starts with the given prefix. */
function infoCallsStarting(info: { mock: { calls: unknown[][] } }, prefix: string): unknown[][] {
  return info.mock.calls.filter(
    (args) => typeof args[0] === "string" && args[0].startsWith(prefix),
  );
}

describe("the sampling log", () => {
  it("logs the sampling once per turn, with the effective temperature, top P and repetition penalty", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setUp();
    resolveModelRun.mockImplementation(() =>
      Promise.resolve({
        modelId: "m",
        settings: { temperature: 0.3, topP: 0.9, repetitionPenalty: 1.05 },
        load: {},
        systemBlocks: [],
        contextWindow: null,
      }),
    );
    script = [reply([call("read_text_file", { path: "a.txt" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(infoCallsStarting(info, "[dispatch] sampling:")).toEqual([
      ["[dispatch] sampling:", { temperature: 0.3, topP: 0.9, repetitionPenalty: 1.05 }],
    ]);
    info.mockRestore();
  });
});

describe("the step log", () => {
  it("logs each request with the tokens and time its reply carries", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setUp();
    script = [
      timedReply(
        [call("read_text_file", { path: "a.txt" })],
        "",
        { promptTokens: 120, completionTokens: 5 },
        900,
      ),
      timedReply([], "done", { promptTokens: 130, completionTokens: 7 }, 400),
    ];
    await sendMessage("t1", "read it");
    await settle();

    expect(infoCallsStarting(info, "[dispatch] step ").map((args) => args[0])).toEqual([
      "[dispatch] step 1: prompt_tokens=120, completion_tokens=5, ms=900",
      "[dispatch] step 2: prompt_tokens=130, completion_tokens=7, ms=400",
    ]);
    info.mockRestore();
  });

  it("logs n/a for a value the reply does not carry", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setUp();
    script = [reply([], "done")];
    await sendMessage("t1", "hi");
    await settle();

    expect(infoCallsStarting(info, "[dispatch] step ").map((args) => args[0])).toEqual([
      "[dispatch] step 1: prompt_tokens=n/a, completion_tokens=n/a, ms=n/a",
    ]);
    info.mockRestore();
  });
});

describe("the notes message", () => {
  it("sends the notes last, for one request: the prompt and the stored history before them stay the same", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setUp({ notes: "plan A" });
    script = [
      reply([
        call("read_text_file", { path: "a.txt" }),
        call("dispatch_notes", { text: "plan B" }),
      ]),
      reply([], "done"),
    ];
    await sendMessage("t1", "plan it");
    await settle();

    expect(histories).toHaveLength(2);
    const [first, second] = histories;
    expect(runs[1].systemBlocks).toEqual(runs[0].systemBlocks);
    const storedFirst = first.slice(0, -1);
    const storedSecond = second.slice(0, -1);
    expect(storedSecond.slice(0, storedFirst.length)).toEqual(storedFirst);
    expect(first[first.length - 1]).toEqual({ role: "user", content: `${NOTES_HEADING}\nplan A` });
    expect(second[second.length - 1]).toEqual({
      role: "user",
      content: `${NOTES_HEADING}\nplan B`,
    });
    expect(messagesOf("s1").some((m) => m.content.includes(NOTES_HEADING))).toBe(false);
    info.mockRestore();
  });

  it("adds no notes message when the notes are empty", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setUp();
    script = [reply([], "ok")];
    await sendMessage("t1", "hi");
    await settle();

    expect(histories[0]).toEqual([{ role: "user", content: "hi" }]);
    info.mockRestore();
  });
});

describe("the result budget", () => {
  it("passes the model's result budget to each Dispatch tool call", async () => {
    setUp();
    resolveModelRun.mockImplementation(() =>
      Promise.resolve({
        modelId: "m",
        settings: {},
        load: {},
        systemBlocks: [],
        contextWindow: 8192,
      }),
    );
    script = [reply([call("read_text_file", { path: "a.txt" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    // 8192 tokens * 0.15 * 3.5 = 4301 characters.
    expect(executeTool.mock.calls[0][4]).toBe(4301);
  });

  it("sends no budget when the model's window is not known", async () => {
    setUp();
    script = [reply([call("read_text_file", { path: "a.txt" })]), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(executeTool.mock.calls[0][4]).toBeUndefined();
  });
});

describe("the stall guard", () => {
  const same = () => reply([call("read_text_file", { path: "a.txt" })]);

  it("does not run the fourth identical call: the model gets the nudge, and the turn goes on", async () => {
    setUp();
    script = [same(), same(), same(), same(), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(3);
    const rows = toolRowsOf("s1");
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({
      content: REPEAT_NUDGE_TEXT,
      toolRecord: { status: "denied" },
    });
    expect(savedTask()).toMatchObject({ status: "done", report: "done" });
  });

  it("ends the turn as failed on the third nudge, shows the reason and notifies", async () => {
    setUp();
    script = [same(), same(), same(), same(), same(), same()];
    await sendMessage("t1", "read it");
    await settle();

    const reason =
      "The model kept repeating the same tool call (read_text_file). Send a message to continue.";
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(streamReply).toHaveBeenCalledTimes(6);
    expect(savedTask()).toMatchObject({ status: "failed", error: reason });
    expect(showChatError).toHaveBeenCalledWith("s1", { error: reason });
    expect(notifyIfHidden).toHaveBeenCalledWith("Dispatch replied", `Dispatch stopped: ${reason}`);
  });

  it("a different call between identical ones resets the repeat count, so they run again", async () => {
    setUp();
    const other = () => reply([call("read_text_file", { path: "b.txt" })]);
    script = [same(), same(), same(), other(), same(), same(), same(), reply([], "done")];
    await sendMessage("t1", "read it");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(7);
    expect(savedTask()).toMatchObject({ status: "done" });
  });

  it("ends the turn after six failed calls in a row, quoting the last error", async () => {
    setUp();
    executeTool.mockResolvedValue({
      ok: false,
      content: "Connection refused",
      truncated: false,
      durationMs: 1,
    });
    script = Array.from({ length: 6 }, (_, i) =>
      reply([call("read_text_file", { path: `f${i}.txt` })]),
    );
    await sendMessage("t1", "read them");
    await settle();

    const reason =
      "6 tool calls in a row failed. Last error: Connection refused. Send a message to continue.";
    expect(executeTool).toHaveBeenCalledTimes(6);
    expect(savedTask()).toMatchObject({ status: "failed", error: reason });
    expect(notifyIfHidden).toHaveBeenCalledWith("Dispatch replied", `Dispatch stopped: ${reason}`);
  });

  it("a successful call in the middle of failures resets the error streak, so the turn goes on", async () => {
    setUp();
    executeTool.mockImplementation(async (_name: string, args: string) => {
      const { path } = JSON.parse(args) as { path: string };
      const ok = path === "ok.txt";
      return { ok, content: ok ? "fine" : "nope", truncated: false, durationMs: 1 };
    });
    const paths = [
      "f0.txt",
      "f1.txt",
      "f2.txt",
      "f3.txt",
      "f4.txt",
      "ok.txt",
      "g0.txt",
      "g1.txt",
      "g2.txt",
      "g3.txt",
      "g4.txt",
    ];
    script = [...paths.map((path) => reply([call("read_text_file", { path })])), reply([], "done")];
    await sendMessage("t1", "read them");
    await settle();

    expect(executeTool).toHaveBeenCalledTimes(11);
    expect(savedTask()).toMatchObject({ status: "done", report: "done" });
  });
});
