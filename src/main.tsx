import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FluentProvider theme={webDarkTheme}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </FluentProvider>
  </React.StrictMode>,
);
