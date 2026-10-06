import { Toaster } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import AppBootstrap from "./components/AppBootstrap";
import Navigation from "./Navigation";

/**
 * App shell — pure scaffolding only. Providers, the router and the toaster
 * live here; all bootstrap logic (data loading, Tauri listeners, persistence)
 * is delegated to `AppBootstrap`, and all routes to `Navigation`.
 */
export default function App() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AppBootstrap>
        <Navigation />
        <Toaster toasterId="app-toaster" />
      </AppBootstrap>
    </MemoryRouter>
  );
}
