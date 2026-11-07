import {
  createDOMRenderer,
  FluentProvider,
  RendererProvider,
  webDarkTheme,
} from "@fluentui/react-components";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { pageStyleNonce, styleTagAttributes } from "./utils/cspNonce";

// Fluent UI adds its styles at runtime; in a production build the page policy only allows style tags
// that carry the nonce Tauri put on the page.
const renderer = createDOMRenderer(document, {
  styleElementAttributes: styleTagAttributes(pageStyleNonce()),
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RendererProvider renderer={renderer}>
      <FluentProvider theme={webDarkTheme}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </FluentProvider>
    </RendererProvider>
  </React.StrictMode>,
);
