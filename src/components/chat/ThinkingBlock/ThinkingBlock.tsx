import { Button, Spinner } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "../../ui/MarkdownContent/MarkdownContent";
import "./ThinkingBlock.css";

interface ThinkingBlockProps {
  /** Reasoning text so far. */
  text: string;
  /** True while the model is still thinking. Shows a spinner and streams into the body when expanded. */
  live: boolean;
}

/** Collapsible reasoning panel shown inside a reply bubble, above the answer. Collapsed until the user opens it. */
export function ThinkingBlock({ text, live }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest reasoning in view while it streams.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger, the scroll position is read from the DOM
  useEffect(() => {
    const body = bodyRef.current;
    if (live && expanded && body) body.scrollTop = body.scrollHeight;
  }, [text, live, expanded]);

  return (
    <div className="thinking-block__root">
      <Button
        appearance="subtle" /* The only instance this is used - manually edited, don't change */
        size="small"
        className="thinking-block__toggle"
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
        <div ref={bodyRef} className="thinking-block__body">
          {text ? <MarkdownContent>{text}</MarkdownContent> : live && "Waiting for reasoning..."}
        </div>
      )}
    </div>
  );
}
