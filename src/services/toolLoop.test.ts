import { beforeEach, describe, expect, it, vi } from "vitest";
import { messagesOf, useChatStore } from "../stores/chatStore";
import { useToolApprovalStore } from "../stores/toolApprovalStore";
import { useToolStore } from "../stores/toolStore";
import type { CapabilityEntry, ChatToolCall, Message, ToolResult, ToolSpec } from "../types";
import { TOOL_TEXT } from "../utils/toolLoop";

const executeTool = vi.fn();
vi.mock("./tools", () => ({
  executeTool: (name: string, args: string, folders: string[], sources: string[] | null) =>
    executeTool(name, args, folders, sources),
  listTools: () => Promise.resolve([]),
  listSearchSources: () => Promise.resolve([]),
}));

vi.mock("./toolSettings", () => ({
  loadAllowedFolders: () => Promise.resolve([]),
  loadSearchSourceIds: () => Promise.resolve([]),
  loadToolStates: () => Promise.resolve({}),
  saveAllowedFolders: () => Promise.resolve(),
  saveSearchSourceIds: () => Promise.resolve(),
  saveToolState: () => Promise.resolve(),
}));

const saveMessage = vi.fn();
vi.mock("./database", () => ({
  saveMessage: (sessionId: string, message: Message) => saveMessage(sessionId, message),
}));

const streamReply = vi.fn();
vi.mock("./chatRun", () => ({
  streamReply: (...args: unknown[]) => streamReply(...args),
}));

const loadModelCapabilities = vi.fn();
vi.mock("./models", () => ({
  loadModelCapabilities: (modelName: string) => loadModelCapabilities(modelName),
}));

// The history of a tool image reads the file again: the file is always there in these tests.
vi.mock("./system", () => ({
  fileExists: () => Promise.resolve(true),
}));

vi.mock("./attachments", () => ({
  readAttachment: (path: string) =>
    Promise.resolve({
      kind: "image",
      name: "a.png",
      size: 10,
      path,
      mime: "image/png",
      data: "DATA",
      text: null,
    }),
}));

const toastInfo = vi.fn();
vi.mock("../utils/toast", () => ({
  toast: {
    info: (title: string, body?: string) => toastInfo(title, body),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import type { ModelRun } from "./chatRun";
import { abortToolLoop, beginToolRun, runToolRounds, toolsForRun } from "./toolLoop";

const CHAT = "chat-1";

const specs: ToolSpec[] = [
  {
    id: "list_directory",
    name: "list_directory",
    description: "List a folder.",
    parameters: { type: "object" },
    risk: "read",
    source: "native",
  },
  {
    id: "read_text_file",
    name: "read_text_file",
    description: "Read a text file.",
    parameters: { type: "object" },
    risk: "read",
    source: "native",
  },
];

const run: ModelRun = {
  modelId: "model",
  settings: {},
  load: {},
  systemBlocks: [],
  contextWindow: null,
};

const okResult: ToolResult = { ok: true, content: "a.txt", truncated: false, durationMs: 5 };

/** A call to `name` with a path argument. */
function call(id: string, name = "list_directory", path = "C:\\notes"): ChatToolCall {
  return { id, name, arguments: JSON.stringify({ path }) };
}

/** A chat whose last reply made `calls` and has no results yet. */
function seedChat(calls: ChatToolCall[]): void {
  const prompt: Message = { id: "user-1", role: "user", content: "list my notes", timestamp: 1 };
  const reply: Message = {
    id: "reply-0",
    role: "assistant",
    content: "Let me check.",
    timestamp: 2,
    toolCalls: calls,
  };
  useChatStore.setState({
    sessions: [
      {
        id: CHAT,
        title: "Chat",
        messages: [prompt, reply],
        contextChars: 0,
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
      },
    ],
    activeSessionId: CHAT,
    isStreaming: true,
    activeStream: { streamId: "stream-0", sessionId: CHAT },
  });
}

/** The replies the fake `streamReply` writes, one per request, in order. Calls are stored as the hook stores them. */
let replies: { text?: string; calls?: ChatToolCall[] }[] = [];

function queueReplies(...next: { text?: string; calls?: ChatToolCall[] }[]): void {
  replies = [...next];
}

function toolRows(): Message[] {
  return messagesOf(CHAT).filter((m) => m.role === "tool");
}

async function firstPendingApprovalId(): Promise<string> {
  await vi.waitFor(() => expect(useToolApprovalStore.getState().pending).toHaveLength(1));
  return useToolApprovalStore.getState().pending[0].request.id;
}

beforeEach(() => {
  vi.clearAllMocks();
  replies = [];
  beginToolRun(CHAT);
  executeTool.mockResolvedValue(okResult);
  saveMessage.mockResolvedValue(undefined);
  loadModelCapabilities.mockResolvedValue([]);
  streamReply.mockImplementation(async (sessionId: string) => {
    const next = replies.shift() ?? { text: "Done." };
    const reply: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: next.text ?? "",
      timestamp: Date.now(),
      toolCalls: next.calls,
    };
    useChatStore.getState().addMessage(sessionId, reply);
    return null;
  });
  useToolStore.setState({
    tools: specs,
    states: {},
    allowedFolders: ["C:\\notes"],
    searchSources: [],
    enabledSearchSources: [],
    chatGrants: {},
  });
  useToolApprovalStore.setState({ pending: [] });
});

describe("runToolRounds", () => {
  it("runs an on tool, stores its row, and asks the model again with tools", async () => {
    seedChat([call("c1")]);
    useToolStore.setState({ states: { list_directory: "on" } });
    queueReplies({ text: "Here are the files." });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(executeTool).toHaveBeenCalledWith(
      "list_directory",
      call("c1").arguments,
      ["C:\\notes"],
      [],
    );
    expect(toolRows()).toHaveLength(1);
    expect(toolRows()[0]).toMatchObject({
      content: "a.txt",
      toolRecord: { callId: "c1", status: "ok", approval: "auto", durationMs: 5, truncated: false },
    });
    expect(saveMessage).toHaveBeenCalledWith(CHAT, expect.objectContaining({ role: "tool" }));
    expect(streamReply).toHaveBeenCalledTimes(1);
    expect(streamReply.mock.calls[0][3]).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: "list_directory" }) }),
    ]);
    const messages = messagesOf(CHAT);
    expect(messages[messages.length - 1].content).toBe("Here are the files.");
  });

  it("does not ask the user for an ask tool that the user denies", async () => {
    seedChat([call("c1", "read_text_file", "C:\\notes\\a.txt")]);
    useToolStore.setState({ states: { read_text_file: "ask" } });
    queueReplies({ text: "I could not read it." });

    const finished = runToolRounds(CHAT, run);
    const approvalId = await firstPendingApprovalId();
    useToolApprovalStore.getState().resolveApproval(approvalId, "deny");

    await expect(finished).resolves.toBeNull();
    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRows()[0]).toMatchObject({
      content: TOOL_TEXT.denied,
      toolRecord: { status: "denied", approval: "once" },
    });
    expect(streamReply.mock.calls[0][3]).toEqual([expect.anything()]);
  });

  it("runs an ask tool once the chat is allowed, and the second call needs no prompt", async () => {
    seedChat([
      call("c1", "read_text_file", "C:\\notes\\a.txt"),
      call("c2", "read_text_file", "C:\\notes\\b.txt"),
    ]);
    useToolStore.setState({ states: { read_text_file: "ask" } });
    queueReplies({ text: "Both read." });

    const finished = runToolRounds(CHAT, run);
    const approvalId = await firstPendingApprovalId();
    useToolApprovalStore.getState().resolveApproval(approvalId, "chat");

    await vi.waitFor(() => expect(executeTool).toHaveBeenCalledTimes(2));
    expect(useToolApprovalStore.getState().pending).toEqual([]);
    await expect(finished).resolves.toBeNull();

    expect(useToolStore.getState().hasChatGrant(CHAT, "read_text_file")).toBe(true);
    expect(toolRows().map((row) => row.toolRecord?.approval)).toEqual(["chat", "chat"]);
  });

  it("answers an off tool with the off text and never runs it", async () => {
    seedChat([call("c1", "read_text_file")]);
    queueReplies({ text: "That tool is off." });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(executeTool).not.toHaveBeenCalled();
    expect(useToolApprovalStore.getState().pending).toEqual([]);
    expect(toolRows()[0]).toMatchObject({
      content: "This tool is turned off.",
      toolRecord: { status: "denied", approval: "once" },
    });
    expect(streamReply.mock.calls[0][3]).toBeUndefined();
  });

  it("answers an unknown tool with an error row and runs nothing", async () => {
    seedChat([call("c1", "delete_everything")]);
    useToolStore.setState({ states: { list_directory: "on" } });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRows()[0]).toMatchObject({
      content: "Unknown tool: delete_everything",
      toolRecord: { callId: "c1", status: "error" },
    });
  });

  it("runs four of five calls in a round and answers the fifth as skipped", async () => {
    seedChat([call("c1"), call("c2"), call("c3"), call("c4"), call("c5")]);
    useToolStore.setState({ states: { list_directory: "on" } });
    queueReplies({ text: "Done." });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(executeTool).toHaveBeenCalledTimes(4);
    const rows = toolRows();
    expect(rows.map((row) => row.toolRecord?.callId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(rows[4]).toMatchObject({
      content: TOOL_TEXT.skipped,
      toolRecord: { status: "denied" },
    });
  });

  it("stops after five rounds, and the sixth request offers no tools", async () => {
    seedChat([call("c0")]);
    useToolStore.setState({ states: { list_directory: "on" } });
    queueReplies(
      { calls: [call("c1")] },
      { calls: [call("c2")] },
      { calls: [call("c3")] },
      { calls: [call("c4")] },
      { calls: [call("c5")] },
    );

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(executeTool).toHaveBeenCalledTimes(5);
    expect(streamReply).toHaveBeenCalledTimes(5);
    const toolsPerRequest = streamReply.mock.calls.map((args) => args[3]);
    expect(toolsPerRequest.slice(0, 4).every((tools) => Array.isArray(tools))).toBe(true);
    expect(toolsPerRequest[4]).toBeUndefined();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo).toHaveBeenCalledWith("Tool limit reached", expect.any(String));
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("stops at a user's stop during an approval, and cancels that call", async () => {
    seedChat([call("c1", "read_text_file", "C:\\notes\\a.txt"), call("c2")]);
    useToolStore.setState({ states: { read_text_file: "ask", list_directory: "on" } });

    const finished = runToolRounds(CHAT, run);
    await firstPendingApprovalId();
    abortToolLoop(CHAT);

    await expect(finished).resolves.toBeNull();
    expect(executeTool).not.toHaveBeenCalled();
    expect(streamReply).not.toHaveBeenCalled();
    expect(useToolApprovalStore.getState().pending).toEqual([]);
    expect(toolRows()[0]).toMatchObject({
      content: TOOL_TEXT.cancelled,
      toolRecord: { callId: "c1", status: "cancelled" },
    });
    expect(toolRows()).toHaveLength(2);
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().activeStream).toBeNull();
  });

  it("turns a thrown tool error into an error row", async () => {
    seedChat([call("c1")]);
    useToolStore.setState({ states: { list_directory: "on" } });
    executeTool.mockRejectedValue(new Error("disk gone"));

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(toolRows()[0]).toMatchObject({
      content: "disk gone",
      toolRecord: { status: "error", approval: "auto" },
    });
  });

  it("returns a failure from the next request, and clears streaming", async () => {
    seedChat([call("c1")]);
    useToolStore.setState({ states: { list_directory: "on" } });
    streamReply.mockResolvedValueOnce({ error: "server down" });

    await expect(runToolRounds(CHAT, run)).resolves.toEqual({ error: "server down" });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().activeStream).toBeNull();
  });

  it("does nothing when the last reply made no calls", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: CHAT,
          title: "Chat",
          messages: [{ id: "reply", role: "assistant", content: "Hi", timestamp: 1 }],
          contextChars: 0,
          createdAt: 1,
          updatedAt: 1,
          pinned: false,
        },
      ],
      isStreaming: true,
      activeStream: { streamId: "stream-0", sessionId: CHAT },
    });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();
    expect(streamReply).not.toHaveBeenCalled();
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});

describe("toolsForRun", () => {
  it("offers nothing when every tool is off", async () => {
    useToolStore.setState({ states: { list_directory: "off" } });
    await expect(toolsForRun(run)).resolves.toBeUndefined();
  });

  it("offers the tools that are not off", async () => {
    useToolStore.setState({ states: { list_directory: "on", read_text_file: "ask" } });
    const offered = await toolsForRun(run);
    expect(offered?.map((tool) => tool.function.name)).toEqual([
      "list_directory",
      "read_text_file",
    ]);
  });

  it("offers nothing when the model's scan says it does not call tools", async () => {
    useToolStore.setState({ states: { list_directory: "on" } });
    const scan: CapabilityEntry[] = [
      { key: "toolCalls", status: "rejected", detail: null, probedAt: 1, stale: false },
    ];
    loadModelCapabilities.mockResolvedValue(scan);
    await expect(toolsForRun(run)).resolves.toBeUndefined();
  });

  it("offers tools when the scan is unknown or cannot be read", async () => {
    useToolStore.setState({ states: { list_directory: "on" } });
    loadModelCapabilities.mockRejectedValue(new Error("no scan"));
    await expect(toolsForRun(run)).resolves.toHaveLength(1);
  });

  it("tells the file tools the allowed folders", async () => {
    useToolStore.setState({ states: { list_directory: "on" }, allowedFolders: ["C:\\notes"] });
    const offered = await toolsForRun(run);
    expect(offered?.[0].function.description).toBe(
      "List a folder. Allowed folders: C:\\notes. Always use full paths inside these folders.",
    );
  });
});

describe("image results", () => {
  const picture: ToolResult = {
    ok: true,
    content: "Image a.png (640x480)",
    truncated: false,
    durationMs: 3,
    attachment: { path: "C:\\notes\\a.png", name: "a.png", mime: "image/png" },
  };
  const visionWorks: CapabilityEntry = {
    key: "vision",
    status: "works",
    detail: null,
    probedAt: 1,
    stale: false,
  };

  beforeEach(() => {
    const readImageSpec: ToolSpec = {
      id: "read_image",
      name: "read_image",
      description: "Read an image.",
      parameters: { type: "object" },
      risk: "read",
      source: "native",
    };
    useToolStore.setState({ tools: [...specs, readImageSpec], states: { read_image: "on" } });
    seedChat([call("c1", "read_image", "C:\\notes\\a.png")]);
    executeTool.mockResolvedValue(picture);
  });

  it("keeps the image on the tool row when the model's scan confirms vision", async () => {
    loadModelCapabilities.mockResolvedValue([visionWorks]);
    queueReplies({ text: "A cat." });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(loadModelCapabilities).toHaveBeenCalledWith("model");
    expect(toolRows()[0]).toMatchObject({
      content: "Image a.png (640x480)",
      toolRecord: { status: "ok" },
      attachments: [
        expect.objectContaining({ kind: "image", name: "a.png", path: "C:\\notes\\a.png" }),
      ],
    });
  });

  it("turns the image into a failed result when the scan does not confirm vision", async () => {
    loadModelCapabilities.mockResolvedValue([]);
    queueReplies({ text: "I cannot see it." });

    await expect(runToolRounds(CHAT, run)).resolves.toBeNull();

    expect(toolRows()[0]).toMatchObject({
      content: TOOL_TEXT.noVision,
      toolRecord: { status: "error" },
    });
    expect(toolRows()[0].attachments).toBeUndefined();
  });

  it("refuses the image when no model is loaded, without reading the scan", async () => {
    queueReplies({ text: "No picture." });

    await expect(runToolRounds(CHAT, { ...run, modelId: null })).resolves.toBeNull();

    expect(loadModelCapabilities).not.toHaveBeenCalled();
    expect(toolRows()[0]).toMatchObject({ content: TOOL_TEXT.noVision });
  });

  it("keeps a result without an image as it is, even when the model's scan does not confirm vision", async () => {
    loadModelCapabilities.mockResolvedValue([]);
    executeTool.mockResolvedValue(okResult);
    queueReplies({ text: "Listed." });

    await runToolRounds(CHAT, run);

    expect(toolRows()[0]).toMatchObject({
      content: "a.txt",
      toolRecord: { status: "ok" },
    });
    expect(toolRows()[0].attachments).toBeUndefined();
  });
});

describe("web_search sources", () => {
  const search: ToolSpec = {
    id: "web_search",
    name: "web_search",
    description: "Search public sources.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        source: { type: "string", enum: ["wikipedia", "hacker_news"], description: "Source." },
      },
      required: ["query"],
    },
    risk: "network",
    source: "native",
  };
  const sources = [
    { id: "wikipedia", label: "Wikipedia", host: "en.wikipedia.org", description: "Facts." },
    { id: "hacker_news", label: "Hacker News", host: "hn.algolia.com", description: "Tech." },
  ];

  /** A web_search call for the query "rust". */
  function searchCall(id: string): ChatToolCall {
    return { id, name: "web_search", arguments: JSON.stringify({ query: "rust" }) };
  }

  /** A store with web_search on and the given sources turned on. */
  function searchOn(enabled: string[]): void {
    useToolStore.setState({
      tools: [...specs, search],
      states: { web_search: "on" },
      searchSources: sources,
      enabledSearchSources: enabled,
    });
  }

  it("offers web_search narrowed to the turned-on sources", async () => {
    searchOn(["hacker_news"]);
    const offered = await toolsForRun(run);
    const tool = offered?.find((item) => item.function.name === "web_search");
    expect(tool?.function.parameters).toMatchObject({
      properties: { source: { enum: ["hacker_news"] } },
    });
  });

  it("does not offer web_search when no source is turned on, even when it is on", async () => {
    searchOn([]);
    await expect(toolsForRun(run)).resolves.toBeUndefined();
  });

  it("passes the turned-on sources to every call, dropping ids the list no longer has", async () => {
    searchOn(["hacker_news", "gone"]);
    seedChat([searchCall("c1")]);
    queueReplies({ text: "Done." });

    await runToolRounds(CHAT, run);

    expect(executeTool).toHaveBeenCalledWith(
      "web_search",
      searchCall("c1").arguments,
      ["C:\\notes"],
      ["hacker_news"],
    );
  });

  it("answers a search call with no source turned on as not available, without running it", async () => {
    searchOn([]);
    seedChat([searchCall("c1")]);
    queueReplies({ text: "Done." });

    await runToolRounds(CHAT, run);

    expect(executeTool).not.toHaveBeenCalled();
    expect(toolRows()[0]).toMatchObject({
      content: TOOL_TEXT.noSource,
      toolRecord: { status: "denied" },
    });
  });
});
