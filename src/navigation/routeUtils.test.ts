import { describe, expect, it } from "vitest";
import { OCR_TAB_LABEL } from "../utils/ocrText";
import { SD_CPP_RUNTIME_ID } from "../utils/playground";
import { SHERPA_RUNTIME_ID } from "../utils/speech";
import { UPSCALE_TAB_LABEL } from "../utils/upscaleText";
import { ROUTES, type RouteMeta } from "./routes";
import {
  breadcrumbsFor,
  childrenOf,
  isPlaygroundPath,
  playgroundToolOf,
  routeById,
  sectionOf,
} from "./routeUtils";

function allRoutes(routes: readonly RouteMeta[]): RouteMeta[] {
  return routes.flatMap((route) => [route, ...allRoutes(route.children ?? [])]);
}

describe("breadcrumbsFor", () => {
  it("gives one crumb on a landing, so no trail is shown", () => {
    expect(breadcrumbsFor("/models")).toEqual([{ label: "Models", to: "/models" }]);
  });

  it("gives one crumb on the Overview", () => {
    expect(breadcrumbsFor("/")).toEqual([{ label: "Overview", to: "/" }]);
  });

  it("gives the landing and the sub-page for a sub-page", () => {
    expect(breadcrumbsFor("/models/huggingface")).toEqual([
      { label: "Models", to: "/models" },
      { label: "Hugging Face", to: "/models/huggingface" },
    ]);
  });

  it("uses the decoded repo id as the last label of a dynamic detail page", () => {
    expect(breadcrumbsFor("/models/local/org%2Frepo%3AQ4_K_M")).toEqual([
      { label: "Models", to: "/models" },
      { label: "Installed models", to: "/models/local" },
      { label: "org/repo:Q4_K_M", to: "/models/local/org%2Frepo%3AQ4_K_M" },
    ]);
  });

  it("decodes spaces in a dynamic parameter and keeps the link encoded", () => {
    const crumbs = breadcrumbsFor("/models/aihub/some%20model");
    expect(crumbs[2]).toEqual({ label: "some model", to: "/models/aihub/some%20model" });
  });

  it("gives no crumbs for a path the table does not know", () => {
    expect(breadcrumbsFor("/models/unknown/a/b")).toEqual([]);
    expect(breadcrumbsFor("/chat/abc/extra")).toEqual([]);
  });

  it("gives one Chat crumb on the chat landing", () => {
    expect(breadcrumbsFor("/chat")).toEqual([{ label: "Chat", to: "/chat" }]);
  });

  it("gives Chat > conversation for an open conversation, with the Chat crumb linking to the landing", () => {
    const crumbs = breadcrumbsFor("/chat/3f2a9c1e-0b7d");
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toEqual({ label: "Chat", to: "/chat" });
    expect(crumbs[1]?.to).toBe("/chat/3f2a9c1e-0b7d");
  });

  it("gives the Settings landing one crumb", () => {
    expect(breadcrumbsFor("/settings")).toEqual([{ label: "Settings", to: "/settings" }]);
  });

  it("gives Settings > Runtimes for a Settings sub-page", () => {
    expect(breadcrumbsFor("/settings/runtimes")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Runtimes", to: "/settings/runtimes" },
    ]);
  });

  it("gives Settings > About for the About page", () => {
    expect(breadcrumbsFor("/settings/about")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "About", to: "/settings/about" },
    ]);
  });

  it("gives Benchmarks > Runs for a benchmark sub-page", () => {
    expect(breadcrumbsFor("/benchmarks/runs")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Runs", to: "/benchmarks/runs" },
    ]);
  });

  it("gives Benchmarks > Prompt Library > New prompt for a new prompt", () => {
    expect(breadcrumbsFor("/benchmarks/prompts/new")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Prompt Library", to: "/benchmarks/prompts" },
      { label: "New prompt", to: "/benchmarks/prompts/new" },
    ]);
  });

  it("gives the prompt's title, not its id, as the last crumb of a saved prompt", () => {
    const crumbs = breadcrumbsFor("/benchmarks/prompts/3f2a9c1e-0b7d");
    expect(crumbs).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Prompt Library", to: "/benchmarks/prompts" },
      { label: "Prompt", to: "/benchmarks/prompts/3f2a9c1e-0b7d" },
    ]);
  });

  it("keeps the encoded prompt id in the link", () => {
    expect(breadcrumbsFor("/benchmarks/prompts/a%20b")[2]).toEqual({
      label: "Prompt",
      to: "/benchmarks/prompts/a%20b",
    });
  });

  it("gives Benchmarks > Test Runs > New suite for a new suite", () => {
    expect(breadcrumbsFor("/benchmarks/suites/new")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Test Runs", to: "/benchmarks/suites" },
      { label: "New suite", to: "/benchmarks/suites/new" },
    ]);
  });

  it("gives the suite's title, not its id, as the last crumb of a saved suite", () => {
    expect(breadcrumbsFor("/benchmarks/suites/9b1e-4c")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Test Runs", to: "/benchmarks/suites" },
      { label: "Suite", to: "/benchmarks/suites/9b1e-4c" },
    ]);
  });

  it("gives Benchmarks > Runs > Run details for a run, without its id as the label", () => {
    expect(breadcrumbsFor("/benchmarks/runs/7c0d-run")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Runs", to: "/benchmarks/runs" },
      { label: "Run details", to: "/benchmarks/runs/7c0d-run" },
    ]);
  });

  it("does not confuse the Run page with a run's details", () => {
    expect(breadcrumbsFor("/benchmarks/run")[1]?.label).toBe("Run");
    expect(breadcrumbsFor("/benchmarks/run")).toHaveLength(2);
  });

  it("gives Benchmarks > Run > Suite for a suite's run page, with the title until the name loads", () => {
    expect(breadcrumbsFor("/benchmarks/run/9b1e-4c")).toEqual([
      { label: "Benchmarks", to: "/benchmarks" },
      { label: "Run", to: "/benchmarks/run" },
      { label: "Suite", to: "/benchmarks/run/9b1e-4c" },
    ]);
  });

  it("gives the benchmarks landing one crumb", () => {
    expect(breadcrumbsFor("/benchmarks")).toEqual([{ label: "Benchmarks", to: "/benchmarks" }]);
  });

  it("gives the Playground landing one crumb", () => {
    expect(breadcrumbsFor("/playground")).toEqual([{ label: "Playground", to: "/playground" }]);
  });

  it("gives Playground > Text to image for the text to image tool", () => {
    expect(breadcrumbsFor("/playground/text-to-image")).toEqual([
      { label: "Playground", to: "/playground" },
      { label: "Text to image", to: "/playground/text-to-image" },
    ]);
  });

  it("gives Playground > OCR and Playground > Image upscaling with the shared tab labels", () => {
    expect(breadcrumbsFor("/playground/ocr")[1]?.label).toBe(OCR_TAB_LABEL);
    expect(breadcrumbsFor("/playground/image-upscaling")[1]?.label).toBe(UPSCALE_TAB_LABEL);
  });

  it("gives Playground > Audio for the Audio tool", () => {
    expect(breadcrumbsFor("/playground/audio")).toEqual([
      { label: "Playground", to: "/playground" },
      { label: "Audio", to: "/playground/audio" },
    ]);
  });
});

describe("childrenOf", () => {
  it("lists the sub-pages of Models in order", () => {
    expect(childrenOf("models").map((route) => route.id)).toEqual([
      "models-local",
      "models-huggingface",
      "models-aihub",
    ]);
  });

  it("gives an empty list for a route without children or an unknown id", () => {
    expect(childrenOf("overview")).toEqual([]);
    expect(childrenOf("nope")).toEqual([]);
  });

  it("finds the children of a sub-page too", () => {
    expect(childrenOf("models-local").map((route) => route.id)).toEqual(["models-local-detail"]);
  });

  it("lists the Settings sections in order, About last", () => {
    expect(childrenOf("settings").map((route) => route.id)).toEqual([
      "settings-app",
      "settings-runtimes",
      "settings-inference",
      "settings-logs",
      "settings-about",
    ]);
  });

  it("gives the About row its title and path", () => {
    const about = childrenOf("settings").find((route) => route.id === "settings-about");
    expect(about?.title).toBe("About");
    expect(about?.path).toBe("/settings/about");
  });

  it("lists the Playground tools in order, with one Audio tool for the three speech tasks", () => {
    expect(childrenOf("playground").map((route) => route.id)).toEqual([
      "playground-text-to-image",
      "playground-image-to-image",
      "playground-image-upscaling",
      "playground-ocr",
      "playground-audio",
    ]);
  });

  it("gives each Playground tool the runtime it cannot work without", () => {
    const needs = childrenOf("playground").map((route) => route.needs);
    expect(needs).toEqual([
      SD_CPP_RUNTIME_ID,
      SD_CPP_RUNTIME_ID,
      SD_CPP_RUNTIME_ID,
      "cli",
      SHERPA_RUNTIME_ID,
    ]);
  });

  it("lists the benchmark pages in order", () => {
    expect(childrenOf("benchmarks").map((route) => route.id)).toEqual([
      "benchmarks-prompts",
      "benchmarks-suites",
      "benchmarks-run",
      "benchmarks-runs",
      "benchmarks-compare",
    ]);
  });

  it("lists the item page under Run and under Runs", () => {
    expect(childrenOf("benchmarks-run").map((route) => route.id)).toEqual(["benchmarks-run-item"]);
    expect(childrenOf("benchmarks-runs").map((route) => route.id)).toEqual([
      "benchmarks-runs-item",
    ]);
  });

  it("lists the new and item pages under the Prompt Library and Test Runs, new first", () => {
    expect(childrenOf("benchmarks-prompts").map((route) => route.id)).toEqual([
      "benchmarks-prompts-new",
      "benchmarks-prompts-item",
    ]);
    expect(childrenOf("benchmarks-suites").map((route) => route.id)).toEqual([
      "benchmarks-suites-new",
      "benchmarks-suites-item",
    ]);
  });
});

describe("routeById", () => {
  it("finds a sub-page by its id", () => {
    expect(routeById("settings-runtimes")?.title).toBe("Runtimes");
    expect(routeById("benchmarks-prompts")?.title).toBe("Prompt Library");
    expect(routeById("settings-about")?.title).toBe("About");
  });

  it("finds a top-level section by its id", () => {
    expect(routeById("settings")?.path).toBe("/settings");
  });

  it("gives undefined for an unknown id", () => {
    expect(routeById("nope")).toBeUndefined();
  });
});

describe("sectionOf (sidebar active item)", () => {
  it("highlights the parent section on a sub-route", () => {
    expect(sectionOf("/models/local").id).toBe("models");
    expect(sectionOf("/models/huggingface/org%2Frepo").id).toBe("models");
  });

  it("highlights the top-level item for its own path and any sub-route", () => {
    expect(sectionOf("/chat").id).toBe("chat");
    expect(sectionOf("/chat/abc123").id).toBe("chat");
    expect(sectionOf("/settings/app").id).toBe("settings");
    expect(sectionOf("/benchmarks/runs").id).toBe("benchmarks");
  });

  it("highlights the parent section on every Settings and benchmark sub-route", () => {
    for (const path of [
      "/settings",
      "/settings/app",
      "/settings/runtimes",
      "/settings/logs",
      "/settings/about",
    ]) {
      expect(sectionOf(path).id).toBe("settings");
    }
    for (const path of [
      "/benchmarks",
      "/benchmarks/prompts",
      "/benchmarks/suites",
      "/benchmarks/run",
      "/benchmarks/run/abc",
      "/benchmarks/compare",
    ]) {
      expect(sectionOf(path).id).toBe("benchmarks");
    }
  });

  it("highlights the Playground on the landing and on every tool", () => {
    for (const route of childrenOf("playground")) {
      expect(sectionOf(route.path).id).toBe("playground");
    }
    expect(sectionOf("/playground").id).toBe("playground");
    expect(sectionOf("/playground/ocr/extra").id).toBe("playground");
  });

  it("highlights the Benchmarks section on the new and item pages", () => {
    for (const path of [
      "/benchmarks/prompts/new",
      "/benchmarks/prompts/abc",
      "/benchmarks/suites/new",
      "/benchmarks/suites/abc",
      "/benchmarks/runs/abc",
    ]) {
      expect(sectionOf(path).id).toBe("benchmarks");
    }
  });

  it("does not confuse /benchmarks/run with /benchmarks/runs in the breadcrumb", () => {
    expect(breadcrumbsFor("/benchmarks/run")[1]?.label).toBe("Run");
    expect(breadcrumbsFor("/benchmarks/runs")[1]?.label).toBe("Runs");
  });

  it("falls back to the Overview for the root and for an unknown path", () => {
    expect(sectionOf("/").id).toBe("overview");
    expect(sectionOf("/unknown").id).toBe("overview");
  });

  it("does not match a path that only shares a prefix with a section", () => {
    expect(sectionOf("/modelsx").id).toBe("overview");
  });
});

describe("isPlaygroundPath", () => {
  it("is true on the landing and on every tool page", () => {
    expect(isPlaygroundPath("/playground")).toBe(true);
    for (const route of childrenOf("playground")) {
      expect(isPlaygroundPath(route.path)).toBe(true);
    }
  });

  it("is false on every other section, and on a path that only shares the prefix", () => {
    for (const path of [
      "/",
      "/chat",
      "/chat/abc",
      "/models/local",
      "/settings/app",
      "/playgrounds",
    ]) {
      expect(isPlaygroundPath(path)).toBe(false);
    }
  });
});

describe("playgroundToolOf", () => {
  it("gives the tool whose page the path is", () => {
    expect(playgroundToolOf("/playground/ocr")?.id).toBe("playground-ocr");
    expect(playgroundToolOf("/playground/audio")?.id).toBe("playground-audio");
  });

  it("gives no tool for the old speech paths, which redirect to the Audio tool", () => {
    expect(playgroundToolOf("/playground/text-to-speech")).toBeNull();
  });

  it("is null on the landing, on another section and on an unknown tool", () => {
    expect(playgroundToolOf("/playground")).toBeNull();
    expect(playgroundToolOf("/chat")).toBeNull();
    expect(playgroundToolOf("/playground/unknown")).toBeNull();
  });
});

describe("route table", () => {
  it("has a unique id for every route", () => {
    const ids = allRoutes(ROUTES).map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every sub-page a path under its parent's path", () => {
    for (const section of ROUTES) {
      for (const child of section.children ?? []) {
        expect(child.path.startsWith(`${section.path}/`)).toBe(true);
      }
    }
  });

  it("gives every title-crumb route a parameter, so the page can name it", () => {
    for (const route of allRoutes(ROUTES)) {
      if (route.titleCrumb) expect(route.path).toMatch(/:\w+/);
    }
  });

  it("lists the top-level sections in sidebar order", () => {
    expect(ROUTES.map((route) => route.id)).toEqual([
      "overview",
      "models",
      "chat",
      "playground",
      "benchmarks",
      "settings",
    ]);
  });
});
