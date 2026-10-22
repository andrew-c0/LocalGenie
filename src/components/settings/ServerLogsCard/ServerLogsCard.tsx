import { Button, Caption1, Card, Text } from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as geniex from "../../../services/geniex";
import type { ServerLogLine } from "../../../types";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import "./ServerLogsCard.css";

/** Matches the backend buffer, so the view never holds more than the backend sends. */
const MAX_VISIBLE_LINES = 2000;

/** Live view of `geniex serve` output: starts from the backend backlog, then appends new lines. */
export default function ServerLogsCard() {
  const [lines, setLines] = useState<ServerLogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    geniex
      .getServerLogs()
      .then(setLines)
      .catch((err) => setError(String(err)));
  }, []);

  // The backlog and live events can overlap, so a line is appended only once.
  useTauriEvent<ServerLogLine>("server-log", (line) => {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && line.seq <= last.seq) return prev;
      return [...prev, line].slice(-MAX_VISIBLE_LINES);
    });
  });

  // Keep the newest line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el && lines.length > 0) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const handleClear = () => {
    geniex
      .clearServerLogs()
      .then(() => setLines([]))
      .catch((err) => setError(String(err)));
  };

  if (error) return <StateBlock icon="⚠️" message={error} />;

  return (
    <Card>
      <div className="server-logs-card__card">
        <div className="server-logs-card__toolbar">
          <Caption1>
            {lines.length} line{lines.length === 1 ? "" : "s"} · newest at the bottom
          </Caption1>
          <Button
            appearance="secondary"
            icon={<DeleteRegular />}
            onClick={handleClear}
            disabled={lines.length === 0}
          >
            Clear
          </Button>
        </div>

        {lines.length === 0 ? (
          <StateBlock
            icon="📜"
            message="No server output yet. Start the GenieX server to see its logs here."
          />
        ) : (
          <div className="server-logs-card__log" ref={logRef} role="log" aria-live="off">
            {lines.map((line) => (
              <Text
                key={line.seq}
                className={
                  line.stream === "stderr"
                    ? `${"server-logs-card__line"} ${"server-logs-card__stderr"}`
                    : "server-logs-card__line"
                }
              >
                {line.message}
              </Text>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
