import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts/Layouts";
import RuntimeGuard from "./components/shell/RuntimeGuard/RuntimeGuard";
import AihubModelsPage from "./pages/AihubModelsPage/AihubModelsPage";
import BenchmarkPage from "./pages/BenchmarkPage/BenchmarkPage";
import BenchmarksLandingPage from "./pages/BenchmarksLandingPage/BenchmarksLandingPage";
import BenchmarkCompare from "./pages/benchmark/BenchmarkCompare/BenchmarkCompare";
import BenchmarkPromptItem from "./pages/benchmark/BenchmarkPromptItem/BenchmarkPromptItem";
import BenchmarkPrompts from "./pages/benchmark/BenchmarkPrompts/BenchmarkPrompts";
import BenchmarkRun from "./pages/benchmark/BenchmarkRun/BenchmarkRun";
import BenchmarkRunDetail from "./pages/benchmark/BenchmarkRunDetail/BenchmarkRunDetail";
import BenchmarkRunItem from "./pages/benchmark/BenchmarkRunItem/BenchmarkRunItem";
import BenchmarkRuns from "./pages/benchmark/BenchmarkRuns/BenchmarkRuns";
import BenchmarkSuiteItem from "./pages/benchmark/BenchmarkSuiteItem/BenchmarkSuiteItem";
import BenchmarkSuites from "./pages/benchmark/BenchmarkSuites/BenchmarkSuites";
import ChatPage from "./pages/ChatPage/ChatPage";
import HubModelsPage from "./pages/HubModelsPage/HubModelsPage";
import LocalModelsBrowserPage from "./pages/LocalModelsBrowserPage/LocalModelsBrowserPage";
import ModelsLandingPage from "./pages/ModelsLandingPage/ModelsLandingPage";
import AihubModelDetail from "./pages/models/AihubModelDetail/AihubModelDetail";
import HubModelDetail from "./pages/models/HubModelDetail/HubModelDetail";
import OverviewPage from "./pages/OverviewPage/OverviewPage";
import PlaygroundLandingPage from "./pages/PlaygroundLandingPage/PlaygroundLandingPage";
import PlaygroundModelDetail from "./pages/PlaygroundModelDetail/PlaygroundModelDetail";
import PlaygroundModelsPage from "./pages/PlaygroundModelsPage/PlaygroundModelsPage";
import PlaygroundSectionPage from "./pages/PlaygroundSectionPage/PlaygroundSectionPage";
import SettingsLandingPage from "./pages/SettingsLandingPage/SettingsLandingPage";
import SettingsSectionPage from "./pages/SettingsSectionPage/SettingsSectionPage";
import { audioTaskUrl } from "./utils/audioTask";

/**
 * Single source of truth for the route tree. All route definitions live here; `App.tsx` only mounts
 * providers, global listeners and this component. The route metadata (titles, icons, landing cards)
 * is in `navigation/routes.ts` and must match these paths.
 *
 * Each main section has a landing page at its own path; sub-pages sit below it and show breadcrumbs.
 * - `/` Overview
 * - `/models` landing, `/models/playground` Playground models (no runtime needed), `/models/playground/:group/:modelId`
 *   one Playground model, `/models/local` installed models, `/models/local/:repoId` one installed model
 * - `/models/huggingface` Hugging Face browser, `/models/huggingface/:repoId` its detail
 * - `/models/aihub` Qualcomm AI Hub catalog, `/models/aihub/:id` its detail
 * - `/chat` default content, `/chat/:sessionId` one conversation
 * - `/playground` landing, `/playground/text-to-image|image-to-image|image-upscaling|ocr|audio` one tool each; the old
 *   `speech-to-text|text-to-speech|audio-to-audio` paths redirect to `audio` with `?task=`
 * - `/settings` landing, `/settings/app|runtimes|inference|logs|about` one page each
 * - `/benchmarks` landing, `/benchmarks/prompts|suites|run|runs|compare` (benchmark sub-pages share one frame),
 *   `/benchmarks/prompts/new|:promptId`, `/benchmarks/suites/new|:suiteId`, `/benchmarks/run/:suiteId`,
 *   `/benchmarks/runs/:runId` (one item each)
 * Route paths are absolute, even under a parent path: `navigation/routePaths.test.ts` compares them with
 * the route table as written.
 */
export default function Navigation() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OverviewPage />} />
        {/* Chat, Benchmarks and the GenieX Models pages need the GenieX CLI; RuntimeGuard redirects to Settings > Runtimes without it. */}
        {/* The Models landing and the Playground models page need no runtime; the GenieX pages below need the CLI. */}
        <Route path="/models" element={<ModelsLandingPage />} />
        <Route path="/models/playground" element={<PlaygroundModelsPage />} />
        <Route path="/models/playground/:group/:modelId" element={<PlaygroundModelDetail />} />
        <Route element={<RuntimeGuard needs="cli" />}>
          <Route path="/models/local" element={<LocalModelsBrowserPage />} />
          <Route path="/models/local/:repoId" element={<HubModelDetail isLocal />} />
          <Route path="/models/huggingface" element={<HubModelsPage />} />
          <Route path="/models/huggingface/:repoId" element={<HubModelDetail isLocal={false} />} />
          <Route path="/models/aihub" element={<AihubModelsPage />} />
          <Route path="/models/aihub/:id" element={<AihubModelDetail />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:sessionId" element={<ChatPage />} />
          <Route path="/benchmarks">
            <Route index element={<BenchmarksLandingPage />} />
            {/* The sub-pages share one frame (padding, scrolling); the landing sits outside it. */}
            <Route element={<BenchmarkPage />}>
              <Route path="/benchmarks/prompts" element={<BenchmarkPrompts />} />
              {/* One item page for both: `new` has no id, so its params are empty. */}
              <Route path="/benchmarks/prompts/new" element={<BenchmarkPromptItem />} />
              <Route path="/benchmarks/prompts/:promptId" element={<BenchmarkPromptItem />} />
              <Route path="/benchmarks/suites" element={<BenchmarkSuites />} />
              <Route path="/benchmarks/suites/new" element={<BenchmarkSuiteItem />} />
              <Route path="/benchmarks/suites/:suiteId" element={<BenchmarkSuiteItem />} />
              <Route path="/benchmarks/run" element={<BenchmarkRun />} />
              <Route path="/benchmarks/run/:suiteId" element={<BenchmarkRunItem />} />
              <Route path="/benchmarks/runs" element={<BenchmarkRuns />} />
              <Route path="/benchmarks/runs/:runId" element={<BenchmarkRunDetail />} />
              <Route path="/benchmarks/compare" element={<BenchmarkCompare />} />
            </Route>
          </Route>
        </Route>
        <Route path="/playground" element={<PlaygroundLandingPage />} />
        <Route
          path="/playground/text-to-image"
          element={<PlaygroundSectionPage routeId="playground-text-to-image" />}
        />
        <Route
          path="/playground/image-to-image"
          element={<PlaygroundSectionPage routeId="playground-image-to-image" />}
        />
        <Route
          path="/playground/image-upscaling"
          element={<PlaygroundSectionPage routeId="playground-image-upscaling" />}
        />
        <Route
          path="/playground/ocr"
          element={<PlaygroundSectionPage routeId="playground-ocr" />}
        />
        <Route
          path="/playground/audio"
          element={<PlaygroundSectionPage routeId="playground-audio" />}
        />
        {/* The three audio tools before the Audio tool: each opens it on its task. */}
        <Route
          path="/playground/speech-to-text"
          element={<Navigate to={audioTaskUrl("transcribe")} replace />}
        />
        <Route
          path="/playground/text-to-speech"
          element={<Navigate to={audioTaskUrl("speak")} replace />}
        />
        <Route
          path="/playground/audio-to-audio"
          element={<Navigate to={audioTaskUrl("enhance")} replace />}
        />
        <Route path="/benchmark" element={<Navigate to="/benchmarks" replace />} />
        <Route path="/prompt-benchmark/*" element={<Navigate to="/benchmarks" replace />} />
        <Route path="/settings" element={<SettingsLandingPage />} />
        <Route path="/settings/app" element={<SettingsSectionPage routeId="settings-app" />} />
        <Route
          path="/settings/runtimes"
          element={<SettingsSectionPage routeId="settings-runtimes" />}
        />
        <Route
          path="/settings/inference"
          element={<SettingsSectionPage routeId="settings-inference" />}
        />
        <Route path="/settings/logs" element={<SettingsSectionPage routeId="settings-logs" />} />
        <Route path="/settings/about" element={<SettingsSectionPage routeId="settings-about" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
