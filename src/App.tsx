import { makeStaticStyles, Toaster, tokens } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import AppBootstrap from "./components/AppBootstrap";
import { APP_TOASTER_ID, ToastRegistrar } from "./components/ToastRegistrar";
import Navigation from "./Navigation";

/**
 * Global reset and scrollbars. The reset drops the browser's default body margin so
 * layouts own their spacing. Scrollbars are thin, rounded and tinted with Fluent
 * tokens, like the Windows 11 / Fluent UI ones.
 */
const useGlobalStyles = makeStaticStyles({
  "html, body, #root": {
    margin: 0,
    padding: 0,
    height: "100%",
  },
  "*::-webkit-scrollbar": {
    width: "14px",
    height: "14px",
  },
  "*::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
  },
  "*::-webkit-scrollbar-corner": {
    backgroundColor: "transparent",
  },
  "*::-webkit-scrollbar-thumb": {
    backgroundColor: tokens.colorNeutralForegroundDisabled,
    border: "4px solid transparent",
    backgroundClip: "padding-box",
    borderRadius: tokens.borderRadiusCircular,
  },
  "*::-webkit-scrollbar-thumb:hover": {
    backgroundColor: tokens.colorNeutralForeground3,
  },
  "*::-webkit-scrollbar-thumb:active": {
    backgroundColor: tokens.colorNeutralForeground2,
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
        <Toaster toasterId={APP_TOASTER_ID} />
        <ToastRegistrar />
      </AppBootstrap>
    </MemoryRouter>
  );
}
