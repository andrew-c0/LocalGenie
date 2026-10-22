import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { SparkleRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from "../../services/window";

/** Caption bar height, matching the Windows 11 title bar. */
const TITLE_BAR_HEIGHT = "32px";
/** Windows' close-button red. Not a Fluent token, but the convention users expect. */
const CLOSE_HOVER_BACKGROUND = "#C42B1C";

const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "stretch",
    flexShrink: 0,
    height: TITLE_BAR_HEIGHT,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    userSelect: "none",
  },
  dragArea: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    paddingLeft: tokens.spacingHorizontalM,
  },
  icon: {
    display: "flex",
    fontSize: "14px",
    color: tokens.colorBrandForeground1,
  },
  title: {
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  controls: {
    display: "flex",
    alignItems: "stretch",
    flexShrink: 0,
  },
  control: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "46px",
    margin: 0,
    padding: 0,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorSubtleBackgroundHover,
      color: tokens.colorNeutralForeground1,
    },
    ":active": {
      backgroundColor: tokens.colorSubtleBackgroundPressed,
    },
    ":focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "-2px",
    },
  },
  closeControl: {
    ":hover": {
      backgroundColor: CLOSE_HOVER_BACKGROUND,
      color: tokens.colorNeutralForegroundInverted,
    },
    ":active": {
      backgroundColor: CLOSE_HOVER_BACKGROUND,
      color: tokens.colorNeutralForegroundInverted,
      opacity: 0.8,
    },
  },
});

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
  const styles = useStyles();
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
    <header className={styles.bar}>
      <div className={styles.dragArea} data-tauri-drag-region>
        <span className={styles.icon} aria-hidden="true" data-tauri-drag-region>
          <SparkleRegular />
        </span>
        <span className={styles.title} data-tauri-drag-region>
          LocalGenie
        </span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          title="Minimize"
          aria-label="Minimize"
          onClick={() => minimizeWindow().catch(() => undefined)}
        >
          <MinimizeGlyph />
        </button>
        <button
          type="button"
          className={styles.control}
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => toggleMaximizeWindow().catch(() => undefined)}
        >
          {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
        </button>
        <button
          type="button"
          className={mergeClasses(styles.control, styles.closeControl)}
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
