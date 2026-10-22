import { makeStaticStyles, Toaster } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import AppBootstrap from "./components/AppBootstrap";
import Navigation from "./Navigation";

/** Global reset: drop the browser's default body margin so layouts own their spacing. */
const useGlobalStyles = makeStaticStyles({
  "html, body, #root": {
    margin: 0,
    padding: 0,
    height: "100%",
  },
});

/**
 * App shell — pure scaffolding only. Providers, the router and the toaster
 * live here; all bootstrap logic (data loading, Tauri listeners, persistence)
 * is delegated to `AppBootstrap`, and all routes to `Navigation`.
 */
export default function App() {
  useGlobalStyles();
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AppBootstrap>
        <Navigation />
        <Toaster toasterId="app-toaster" />
      </AppBootstrap>
    </MemoryRouter>
  );
}
