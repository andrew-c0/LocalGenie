import { Button, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    alignItems: "flex-start",
    width: "100%",
    boxSizing: "border-box",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  toggle: {
    color: tokens.colorNeutralForeground3,
  },
  body: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: "240px",
    overflowY: "auto",
    width: "100%",
    boxSizing: "border-box",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
});

interface ThinkingBlockProps {
  /** Reasoning text so far. */
  text: string;
  /** True while the model is still thinking. Shows a spinner and streams into the body when expanded. */
  live: boolean;
}

/** Collapsible reasoning panel shown inside a reply bubble, above the answer. Collapsed until the user opens it. */
export function ThinkingBlock({ text, live }: ThinkingBlockProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest reasoning in view while it streams.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger, the scroll position is read from the DOM
  useEffect(() => {
    const body = bodyRef.current;
    if (live && expanded && body) body.scrollTop = body.scrollHeight;
  }, [text, live, expanded]);

  return (
    <div className={styles.root}>
      <Button
        appearance="subtle"
        size="small"
        className={styles.toggle}
        icon={
          live ? (
            <Spinner size="tiny" />
          ) : expanded ? (
            <ChevronDownRegular />
          ) : (
            <ChevronRightRegular />
          )
        }
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {live ? "Thinking..." : "Thought process"}
      </Button>
      {expanded && (
        <div ref={bodyRef} className={styles.body}>
          {text || (live ? "Waiting for reasoning..." : "")}
        </div>
      )}
    </div>
  );
}
