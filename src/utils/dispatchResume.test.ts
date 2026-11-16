import { describe, expect, it } from "vitest";
import type { DispatchTask } from "../types";
import {
  continueOrder,
  groupByModel,
  interruptedTasks,
  modelLabelsOf,
  RESUME_LIST_MAX,
  resumeCopy,
  resumeIntro,
  resumeListOf,
  shouldOfferResume,
} from "./dispatchResume";

function task(id: string, overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    id,
    sessionId: `s-${id}`,
    goal: `Goal ${id}`,
    status: "interrupted",
    allowedTools: [],
    limits: { maxSteps: 0, maxMinutes: 0 },
    notes: "",
    report: null,
    error: null,
    steps: 0,
    createdAt: 100,
    startedAt: 110,
    finishedAt: null,
    ...overrides,
  };
}

const READY = { candidates: 1, cliInstalled: true, busy: false };

describe("interruptedTasks", () => {
  it("keeps only interrupted conversations, oldest first", () => {
    const tasks = [
      task("late", { createdAt: 300 }),
      task("done", { status: "done", createdAt: 50 }),
      task("early", { createdAt: 200 }),
      task("stopped", { status: "stopped", createdAt: 10 }),
    ];
    expect(interruptedTasks(tasks).map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("does not offer a stopped conversation, which is what Not now leaves", () => {
    expect(interruptedTasks([task("a", { status: "stopped" })])).toEqual([]);
  });
});

describe("groupByModel", () => {
  it("groups by model in the order each model first appears, keeping the order inside a group", () => {
    const tasks = [
      task("1", { createdAt: 1 }),
      task("2", { createdAt: 2 }),
      task("3", { createdAt: 3 }),
      task("4", { createdAt: 4 }),
    ];
    const models: Record<string, string | null> = {
      "s-1": "B",
      "s-2": "A",
      "s-3": "B",
      "s-4": null,
    };
    const groups = groupByModel(tasks, (item) => models[item.sessionId] ?? null);
    expect(groups.map((group) => group.modelId)).toEqual(["B", "A", null]);
    expect(groups[0].tasks.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("continues group after group, so each model is loaded once", () => {
    const tasks = [task("1"), task("2"), task("3")];
    const models: Record<string, string> = { "s-1": "A", "s-2": "B", "s-3": "A" };
    const groups = groupByModel(tasks, (item) => models[item.sessionId]);
    expect(continueOrder(groups).map((item) => item.id)).toEqual(["1", "3", "2"]);
  });
});

describe("shouldOfferResume", () => {
  it("offers when conversations are interrupted and the CLI is installed", () => {
    expect(shouldOfferResume(READY)).toBe(true);
  });

  it("offers on a normal start, when the server is stopped because the app closed it", () => {
    expect(shouldOfferResume(READY)).toBe(true);
  });

  it("skips when there is nothing interrupted", () => {
    expect(shouldOfferResume({ ...READY, candidates: 0 })).toBe(false);
  });

  it("skips when there is no CLI runtime", () => {
    expect(shouldOfferResume({ ...READY, cliInstalled: false })).toBe(false);
  });

  it("skips while something is in progress", () => {
    expect(shouldOfferResume({ ...READY, busy: true })).toBe(false);
  });
});

describe("resumeListOf", () => {
  it("lists every title up to the limit", () => {
    const tasks = [task("1"), task("2")];
    const list = resumeListOf(tasks);
    expect(list.items.map((item) => item.title)).toEqual(["Goal 1", "Goal 2"]);
    expect(list.more).toBe(0);
  });

  it("caps the list at five and counts the rest", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task(`${i}`));
    const list = resumeListOf(tasks);
    expect(list.items).toHaveLength(RESUME_LIST_MAX);
    expect(list.more).toBe(3);
  });

  it("cuts a long goal to the title length", () => {
    const list = resumeListOf([task("1", { goal: "x".repeat(200) })]);
    expect(list.items[0].title).toHaveLength(60);
  });
});

describe("resume copy", () => {
  it("asks about one conversation and its model in the singular, with no list", () => {
    const groups = groupByModel([task("1")], () => "Qwen-7B");
    const copy = resumeCopy(groups);
    expect(copy.intro).toBe(
      "The last Dispatch run was incomplete. Continue it with the previously selected model?",
    );
    expect(copy.items).toEqual([]);
    expect(copy.modelLine).toBe("Model: Qwen-7B");
  });

  it("lists the titles and asks in the plural for more than one conversation", () => {
    const groups = groupByModel([task("1"), task("2")], () => "Qwen-7B");
    const copy = resumeCopy(groups);
    expect(copy.intro).toContain("Continue them with the previously selected model?");
    expect(copy.items.map((item) => item.title)).toEqual(["Goal 1", "Goal 2"]);
  });

  it("names every model when the conversations used different ones", () => {
    const models: Record<string, string> = { "s-1": "A", "s-2": "B" };
    const groups = groupByModel([task("1"), task("2")], (item) => models[item.sessionId]);
    const copy = resumeCopy(groups);
    expect(copy.intro).toContain("previously selected models?");
    expect(copy.modelLine).toBe("Models: A, B");
  });

  it("says the loaded model when a conversation recorded none", () => {
    const groups = groupByModel([task("1")], () => null);
    expect(resumeCopy(groups).modelLine).toBe("Model: the loaded model");
  });

  it("counts the distinct models, so two groups of one model read as one", () => {
    expect(
      modelLabelsOf([
        { modelId: "A", tasks: [] },
        { modelId: "A", tasks: [] },
      ]),
    ).toEqual(["A"]);
    expect(resumeIntro(1, 1)).toContain("Continue it");
  });
});
