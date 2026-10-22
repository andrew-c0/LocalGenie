import { Outlet } from "react-router-dom";
import { ChatRuntime } from "../../chat/ChatRuntime/ChatRuntime";
import CliMissingBanner from "../CliMissingBanner/CliMissingBanner";
import CloseGuard from "../CloseGuard";
import Header from "../Header/Header";
import Sidebar from "../Sidebar/Sidebar";
import TitleBar from "../TitleBar/TitleBar";
import "./Layouts.css";

/**
 * Main application layout: custom title bar, sidebar navigation, CLI banner, header
 * and the routed page content. Rendered inside the router so pages appear via <Outlet />.
 * `CloseGuard` sits here too, so the close confirmation works on every page. `ChatRuntime`
 * sits here too, so a reply keeps streaming and saving while the user is on another page.
 */
export function MainLayout() {
  return (
    <div className="layout">
      <TitleBar />
      <div className="layout__shell">
        <Sidebar />
        <div className="layout__main">
          <CliMissingBanner />
          <Header />
          <Outlet />
        </div>
      </div>
      <CloseGuard />
      <ChatRuntime />
    </div>
  );
}
