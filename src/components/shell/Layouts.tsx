import {
  Button,
  Spinner,
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import * as geniex from "../../services/geniex";
import { useModelStore } from "../../stores/modelStore";
import Header from "./Header";
import Sidebar from "./Sidebar";

/**
 * Banner shown when the GenieX CLI is missing. Offers a one-click installer
 * launch and reports progress/failures via inline status + toast.
 */
function CliMissingBanner() {
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { dispatchToast } = useToastController("app-toaster");

  if (cliInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setStatus("Downloading GenieX CLI...");
    try {
      const result = await geniex.installGeniex();
      setStatus(result);
      dispatchToast(
        <Toast>
          <ToastTitle>GenieX CLI Installer</ToastTitle>
          <ToastBody>{result}</ToastBody>
        </Toast>,
        { intent: "success" },
      );
      const installed = await geniex.checkGeniexInstalled();
      setCliInstalled(installed);
      if (!installed) {
        dispatchToast(
          <Toast>
            <ToastTitle>Installation started</ToastTitle>
            <ToastBody>
              The GenieX installer launched. Complete the installation and restart the app if
              needed.
            </ToastBody>
          </Toast>,
          { intent: "warning" },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Install failed: ${message}`);
      dispatchToast(
        <Toast>
          <ToastTitle>Install failed</ToastTitle>
          <ToastBody>{message}</ToastBody>
        </Toast>,
        { intent: "error" },
      );
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="cli-missing-banner">
      <span className="cli-missing-banner-icon">⚠️</span>
      <div className="cli-missing-banner-message">
        <span>GenieX CLI not found. Install it to use model management and chatting.</span>
        {status && <span className="cli-missing-banner-detail">{status}</span>}
      </div>
      <Button appearance="primary" size="small" onClick={handleInstall} disabled={installing}>
        {installing ? <Spinner size="tiny" /> : "Install CLI"}
      </Button>
    </div>
  );
}

/**
 * Main application layout: sidebar navigation, CLI banner, header and the
 * routed page content. Rendered inside the router so pages appear via <Outlet />.
 */
export function MainLayout() {
  return (
    <div className="lx-shell">
      <Sidebar />
      <div className="lx-main">
        <CliMissingBanner />
        <Header />
        <Outlet />
      </div>
    </div>
  );
}
