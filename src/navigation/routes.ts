/**
 * Route metadata for the whole app: the sidebar items, the cards on each section landing and the
 * breadcrumb labels. Plain typed data, no state. The paths must match the routes declared in
 * `Navigation.tsx`, which is the only place routes are declared.
 */

import {
  ArrowMaximizeRegular,
  BeakerRegular,
  BookRegular,
  BrainCircuitRegular,
  ChatRegular,
  CloudArrowDownRegular,
  CubeRegular,
  DataBarVerticalRegular,
  DesktopRegular,
  DocumentBulletListRegular,
  DocumentRegular,
  GridRegular,
  HardDriveRegular,
  ImageEditRegular,
  ImageSparkleRegular,
  InfoRegular,
  PlayCircleRegular,
  PlayRegular,
  ScanTextRegular,
  SettingsRegular,
  Speaker2Regular,
  TableRegular,
  TasksAppRegular,
} from "@fluentui/react-icons";
import { createElement, type ReactElement } from "react";
import { OCR_TAB_LABEL } from "../utils/ocrText";
import { SD_CPP_RUNTIME_ID } from "../utils/playground";
import type { RuntimeNeed } from "../utils/runtimeGuards";
import { SHERPA_RUNTIME_ID } from "../utils/speech";
import { UPSCALE_TAB_LABEL } from "../utils/upscaleText";

export interface RouteMeta {
  /** Stable key for lookups (`childrenOf`, `routeById`) and for the landing's facts. */
  id: string;
  /** Absolute path pattern; a `:name` segment is a parameter. */
  path: string;
  /** Label in the sidebar, on landing cards and in breadcrumbs. */
  title: string;
  icon: ReactElement;
  /** One line shown on a landing card. */
  description: string;
  /** The runtime the area needs. The sidebar item is locked while it is missing. */
  needs?: RuntimeNeed;
  /**
   * The breadcrumb shows `title` instead of the decoded parameter. For an item whose parameter is an
   * opaque id: the page names the item with `useBreadcrumbLabel` once it loads, so the id never shows.
   */
  titleCrumb?: boolean;
  /** Sub-pages of this route. A section's children are the cards on its landing. */
  children?: RouteMeta[];
}

/** Overview has no landing of its own; it is the app's home page, the path `/`. */
export const OVERVIEW_ROUTE: RouteMeta = {
  id: "overview",
  path: "/",
  title: "Overview",
  icon: createElement(GridRegular),
  description: "Server state, installed models and recent generation speeds.",
};

const MODELS_ROUTE: RouteMeta = {
  id: "models",
  path: "/models",
  title: "Models",
  icon: createElement(CubeRegular),
  description: "Install, browse and manage the models GenieX runs.",
  // No `needs` here: the Playground models page works without the GenieX CLI, so each GenieX
  // sub-page carries its own need and the landing shows the locked rows.
  children: [
    {
      id: "models-local",
      path: "/models/local",
      title: "Installed models",
      icon: createElement(HardDriveRegular),
      description: "Models installed on this device, ready to load into GenieX.",
      needs: "cli",
      children: [
        {
          id: "models-local-detail",
          path: "/models/local/:repoId",
          title: "Model",
          icon: createElement(HardDriveRegular),
          description: "One installed model.",
          needs: "cli",
        },
      ],
    },
    {
      id: "models-playground",
      path: "/models/playground",
      title: "Playground models",
      icon: createElement(BeakerRegular),
      description: "Image, speech and OCR models for the Playground: installed and recommended.",
      children: [
        {
          id: "models-playground-detail",
          path: "/models/playground/:group/:modelId",
          title: "Model",
          icon: createElement(BeakerRegular),
          description: "One Playground model: its files, starting settings and model card.",
          // The page names the crumb with the model's name once the catalog has loaded.
          titleCrumb: true,
        },
      ],
    },
    {
      id: "models-huggingface",
      path: "/models/huggingface",
      title: "Hugging Face",
      icon: createElement(CloudArrowDownRegular),
      description: "Search Hugging Face and download GGUF models to this device.",
      needs: "cli",
      children: [
        {
          id: "models-huggingface-detail",
          path: "/models/huggingface/:repoId",
          title: "Model",
          icon: createElement(CloudArrowDownRegular),
          description: "One Hugging Face model.",
          needs: "cli",
        },
      ],
    },
    {
      id: "models-aihub",
      path: "/models/aihub",
      title: "Qualcomm AI Hub",
      icon: createElement(BookRegular),
      description: "Browse the Qualcomm AI Hub catalog and download its assets.",
      needs: "cli",
      children: [
        {
          id: "models-aihub-detail",
          path: "/models/aihub/:id",
          title: "Model",
          icon: createElement(BookRegular),
          description: "One Qualcomm AI Hub model.",
          needs: "cli",
        },
      ],
    },
  ],
};

const BENCHMARKS_ROUTE: RouteMeta = {
  id: "benchmarks",
  path: "/benchmarks",
  title: "Benchmarks",
  icon: createElement(PlayCircleRegular),
  description: "Run prompt suites and compare speed and memory.",
  needs: "cli",
  children: [
    {
      id: "benchmarks-prompts",
      path: "/benchmarks/prompts",
      title: "Prompt Library",
      icon: createElement(DocumentRegular),
      description: "Saved prompts & files",
      children: [
        {
          id: "benchmarks-prompts-new",
          path: "/benchmarks/prompts/new",
          title: "New prompt",
          icon: createElement(DocumentRegular),
          description: "Write a prompt, its keywords and files.",
        },
        {
          id: "benchmarks-prompts-item",
          path: "/benchmarks/prompts/:promptId",
          title: "Prompt",
          icon: createElement(DocumentRegular),
          description: "One saved prompt.",
          titleCrumb: true,
        },
      ],
    },
    {
      id: "benchmarks-suites",
      path: "/benchmarks/suites",
      title: "Test Runs",
      icon: createElement(TasksAppRegular),
      description: "Suites of prompt steps",
      children: [
        {
          id: "benchmarks-suites-new",
          path: "/benchmarks/suites/new",
          title: "New suite",
          icon: createElement(TasksAppRegular),
          description: "Build a suite from saved prompts.",
        },
        {
          id: "benchmarks-suites-item",
          path: "/benchmarks/suites/:suiteId",
          title: "Suite",
          icon: createElement(TasksAppRegular),
          description: "One saved suite.",
          titleCrumb: true,
        },
      ],
    },
    {
      id: "benchmarks-run",
      path: "/benchmarks/run",
      title: "Run",
      icon: createElement(PlayRegular),
      description: "Start a suite on the loaded model",
      children: [
        {
          id: "benchmarks-run-item",
          path: "/benchmarks/run/:suiteId",
          title: "Suite",
          icon: createElement(PlayRegular),
          description: "Run one saved suite on the loaded model.",
          titleCrumb: true,
        },
      ],
    },
    {
      id: "benchmarks-runs",
      path: "/benchmarks/runs",
      title: "Runs",
      icon: createElement(TableRegular),
      description: "Finished runs and their figures",
      children: [
        {
          id: "benchmarks-runs-item",
          path: "/benchmarks/runs/:runId",
          title: "Run details",
          icon: createElement(TableRegular),
          description: "One finished run: its passes and replies.",
          titleCrumb: true,
        },
      ],
    },
    {
      id: "benchmarks-compare",
      path: "/benchmarks/compare",
      title: "Compare",
      icon: createElement(DataBarVerticalRegular),
      description: "Charts of the selected runs",
    },
  ],
};

const SETTINGS_ROUTE: RouteMeta = {
  id: "settings",
  path: "/settings",
  title: "Settings",
  icon: createElement(SettingsRegular),
  description: "Runtimes, the server, RAM headroom and app preferences.",
  children: [
    {
      id: "settings-app",
      path: "/settings/app",
      title: "Application & Runtime",
      icon: createElement(DesktopRegular),
      description: "Server port, RAM, summaries",
    },
    {
      id: "settings-runtimes",
      path: "/settings/runtimes",
      title: "Runtimes",
      icon: createElement(CubeRegular),
      description: "GenieX CLI and optional engines",
    },
    {
      id: "settings-inference",
      path: "/settings/inference",
      title: "Inference & Sampling",
      icon: createElement(BrainCircuitRegular),
      description: "Model parameters, system prompt",
    },
    {
      id: "settings-logs",
      path: "/settings/logs",
      title: "Logs",
      icon: createElement(DocumentBulletListRegular),
      description: "GenieX server output",
    },
    {
      id: "settings-about",
      path: "/settings/about",
      title: "About",
      icon: createElement(InfoRegular),
      description: "Version, licence and links",
    },
  ],
};

const PLAYGROUND_ROUTE: RouteMeta = {
  id: "playground",
  path: "/playground",
  title: "Playground",
  icon: createElement(BeakerRegular),
  description: "Image, speech, upscaling and OCR tools.",
  children: [
    {
      id: "playground-text-to-image",
      path: "/playground/text-to-image",
      title: "Text to image",
      icon: createElement(ImageSparkleRegular),
      description: "Generate an image from a text prompt with stable-diffusion.cpp.",
      needs: SD_CPP_RUNTIME_ID,
    },
    {
      id: "playground-image-to-image",
      path: "/playground/image-to-image",
      title: "Image to image",
      icon: createElement(ImageEditRegular),
      description: "Redraw a picture from a prompt, or edit it with instructions.",
      needs: SD_CPP_RUNTIME_ID,
    },
    {
      id: "playground-image-upscaling",
      path: "/playground/image-upscaling",
      title: UPSCALE_TAB_LABEL,
      icon: createElement(ArrowMaximizeRegular),
      description: "Enlarge a picture 4x with an upscaling model, on the CPU.",
      needs: SD_CPP_RUNTIME_ID,
    },
    {
      id: "playground-ocr",
      path: "/playground/ocr",
      title: OCR_TAB_LABEL,
      icon: createElement(ScanTextRegular),
      description: "Read the text in a picture with a vision-language model.",
      needs: "cli",
    },
    {
      id: "playground-audio",
      path: "/playground/audio",
      title: "Audio",
      icon: createElement(Speaker2Regular),
      description:
        "Transcribe speech, speak text aloud, or clean up or split a recording, on the CPU.",
      needs: SHERPA_RUNTIME_ID,
    },
  ],
};

/** Top-level sections in sidebar order. The first entry is the Overview. */
export const ROUTES: RouteMeta[] = [
  OVERVIEW_ROUTE,
  MODELS_ROUTE,
  {
    id: "chat",
    path: "/chat",
    title: "Chat",
    icon: createElement(ChatRegular),
    description: "Talk to a loaded model, with text, images and audio.",
    needs: "cli",
    children: [
      {
        id: "chat-conversation",
        path: "/chat/:sessionId",
        title: "Conversation",
        icon: createElement(ChatRegular),
        description: "One conversation with a loaded model.",
      },
    ],
  },
  PLAYGROUND_ROUTE,
  BENCHMARKS_ROUTE,
  SETTINGS_ROUTE,
];
