import { SparkleRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from "../../../services/window";
import "./TitleBar.css";

/** Caption bar height, matching the Windows 11 title bar. */
/** Windows' close-button red. Not a Fluent token, but the convention users expect. */

/** 10×10 caption glyphs, drawn with a 1px stroke like the Windows 11 icons. */
function MinimizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5.5H10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect
        x="0.5"
        y="2.5"
        width="7"
        height="7"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

/**
 * Custom caption bar replacing the native Windows title bar. Drag area, app name
 * and Windows-style minimize / maximize / close controls. The native frame is
 * off (`decorations: false`), so this bar is the only way to move the window.
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const syncMaximized = () => {
      isWindowMaximized()
        .then(setMaximized)
        .catch(() => undefined);
    };
    syncMaximized();

    let disposed = false;
    let unlisten: (() => void) | undefined;
    onWindowResized(syncMaximized).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <header className="title-bar__bar">
      <div className="title-bar__drag-area" data-tauri-drag-region>
        <span className="title-bar__icon" aria-hidden="true" data-tauri-drag-region>
          <SparkleRegular />
        </span>
        <span className="title-bar__title" data-tauri-drag-region>
          LocalGenie
        </span>
      </div>
      <div className="title-bar__controls">
        <button
          type="button"
          className="title-bar__control"
          title="Minimize"
          aria-label="Minimize"
          onClick={() => minimizeWindow().catch(() => undefined)}
        >
          <MinimizeGlyph />
        </button>
        <button
          type="button"
          className="title-bar__control"
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => toggleMaximizeWindow().catch(() => undefined)}
        >
          {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
        </button>
        <button
          type="button"
          className="title-bar__control title-bar__close-control"
          title="Close"
          aria-label="Close"
          onClick={() => closeWindow().catch(() => undefined)}
        >
          <CloseGlyph />
        </button>
      </div>
    </header>
  );
}
