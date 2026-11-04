import { Outlet } from "react-router-dom";
import { useModelStore } from "../../../stores/modelStore";
import { BenchmarkRuntime } from "../../benchmark/BenchmarkRuntime/BenchmarkRuntime";
import { ChatRuntime } from "../../chat/ChatRuntime/ChatRuntime";
import { PlaygroundRuntime } from "../../playground/PlaygroundRuntime/PlaygroundRuntime";
import { Breadcrumbs } from "../../ui/Breadcrumbs/Breadcrumbs";
import CloseGuard from "../CloseGuard";
import Header from "../Header/Header";
import { RuntimeUpdateRuntime } from "../RuntimeUpdateRuntime/RuntimeUpdateRuntime";
import Sidebar from "../Sidebar/Sidebar";
import TitleBar from "../TitleBar/TitleBar";
import "./Layouts.css";

/**
 * Main application layout: custom title bar, sidebar navigation, header
 * and the routed page content. Rendered inside the router so pages appear via <Outlet />.
 * `CloseGuard` sits here too, so the close confirmation works on every page. `ChatRuntime`
 * sits here too, so a reply keeps streaming and saving while the user is on another page.
 * `PlaygroundRuntime` sits here for the same reason: a download or image keeps updating.
 * `BenchmarkRuntime` does the same for a benchmark run's progress and end.
 * `RuntimeUpdateRuntime` runs the periodic runtime update check and its desktop notice.
 */
export function MainLayout() {
  const selectorOpen = useModelStore((s) => s.selectorOpen);

  return (
    <div className="layout">
      <TitleBar />
      <div className="layout__shell">
        <Sidebar />
        <div className="layout__main">
          <Header />
          <Breadcrumbs />
          <Outlet />
          {/* Dims the header and page while the model selector is open. The sidebar stays clear. */}
          {selectorOpen && <div className="layout__scrim" aria-hidden="true" />}
        </div>
      </div>
      <CloseGuard />
      <ChatRuntime />
      <PlaygroundRuntime />
      <BenchmarkRuntime />
      <RuntimeUpdateRuntime />
    </div>
  );
}
