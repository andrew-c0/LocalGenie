import { Button, Caption1, Checkbox, Textarea, Tooltip } from "@fluentui/react-components";
import { DeleteRegular, DocumentRegular, TextAddRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import * as systemService from "../../../services/system";
import { useModelStore } from "../../../stores/modelStore";
import type { PlatformInfo, SystemPromptBlock } from "../../../types";
import {
  dateTimeSentence,
  estimateTokens,
  formatSize,
  localTimeZone,
  type PlatformSnapshot,
  platformLine,
} from "../../../utils/systemPrompt";
import { toast } from "../../../utils/toast";
import "./SystemPromptEditor.css";

type FileBlock = Extract<SystemPromptBlock, { kind: "file" }>;

/** What the editor knows about an attached file, read when the editor opens. */
interface FileInfo {
  /** Estimated tokens from the file contents. */
  tokens?: number;
  /** Set when the file could not be read now (moved, deleted or not usable). */
  error?: boolean;
}

interface SystemPromptEditorProps {
  blocks: SystemPromptBlock[];
  onChange: (blocks: SystemPromptBlock[]) => void;
  /** Context window in tokens, for comparison with the estimate. */
  contextWindow?: number;
}

/**
 * System prompt blocks. Date & time and platform are on/off checkboxes that show their value on
 * hover. Text is added once. Each file is one row.
 */
export default function SystemPromptEditor({
  blocks,
  onChange,
  contextWindow,
}: SystemPromptEditorProps) {
  const chipset = useModelStore((s) => s.chipset);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [fileInfo, setFileInfo] = useState<Record<string, FileInfo>>({});
  const [now, setNow] = useState(() => new Date());

  // Files are read when the editor opens. Attaching a file reads it at that point instead.
  const openingBlocks = useRef(blocks).current;

  const hasDateTime = blocks.some((b) => b.kind === "datetime");
  const hasPlatform = blocks.some((b) => b.kind === "platform");
  const hasText = blocks.some((b) => b.kind === "text");

  useEffect(() => {
    systemService
      .getPlatformInfo()
      .then(setPlatform)
      .catch(() => setPlatform(null));
  }, []);

  // Keep the date tooltip current while the block is on.
  useEffect(() => {
    if (!hasDateTime) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [hasDateTime]);

  useEffect(() => {
    let cancelled = false;
    const files = openingBlocks.filter((b): b is FileBlock => b.kind === "file");
    Promise.all(
      files.map(async (block): Promise<[string, FileInfo]> => {
        try {
          const text = await systemService.readTextFile(block.path);
          return [block.id, { tokens: estimateTokens(text) }];
        } catch {
          return [block.id, { error: true }];
        }
      }),
    ).then((entries) => {
      if (!cancelled) setFileInfo(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [openingBlocks]);

  const platformSnapshot: PlatformSnapshot | null = platform ? { ...platform, chipset } : null;

  const updateBlock = (id: string, patch: Partial<SystemPromptBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as SystemPromptBlock) : b)));
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  /** Turns a checkbox block on (appended) or off (removed). */
  const setToggle = (kind: "datetime" | "platform", on: boolean) => {
    if (on) {
      onChange([...blocks, { id: crypto.randomUUID(), kind }]);
    } else {
      onChange(blocks.filter((b) => b.kind !== kind));
    }
  };

  const addText = () => {
    onChange([...blocks, { id: crypto.randomUUID(), kind: "text", text: "" }]);
  };

  const attachFile = async () => {
    try {
      const path = await systemService.pickTextFile();
      if (!path) return;
      const text = await systemService.readTextFile(path);
      const id = crypto.randomUUID();
      const name = path.split(/[\\/]/).pop() ?? path;
      const size = new TextEncoder().encode(text).length;
      setFileInfo((prev) => ({ ...prev, [id]: { tokens: estimateTokens(text) } }));
      onChange([...blocks, { id, kind: "file", path, name, size }]);
    } catch (err) {
      toast.error("Could not attach file", String(err));
    }
  };

  const datetimeValue = dateTimeSentence(now, localTimeZone());
  const platformValue = platformLine(platformSnapshot);

  /** Tokens a block adds. Checked date and platform blocks count the text they resolve to now. */
  const tokensOf = (block: SystemPromptBlock): number => {
    switch (block.kind) {
      case "text":
        return estimateTokens(block.text);
      case "file":
        return fileInfo[block.id]?.tokens ?? 0;
      case "datetime":
        return estimateTokens(datetimeValue);
      case "platform":
        return estimateTokens(platformValue ?? "");
    }
  };
  const totalTokens = blocks.reduce((sum, block) => sum + tokensOf(block), 0);
  // Share of the context window, up to two decimals. Recalculated when the window changes.
  const percentOfContext = contextWindow
    ? Number(((totalTokens / contextWindow) * 100).toFixed(2))
    : null;

  return (
    <div className="system-prompt-editor">
      <div className="system-prompt-editor__toggles">
        <Checkbox
          label={
            <Tooltip content={datetimeValue} relationship="description">
              <span>Date & time</span>
            </Tooltip>
          }
          checked={hasDateTime}
          onChange={(_, data) => setToggle("datetime", !!data.checked)}
        />
        <Checkbox
          label={
            <Tooltip
              content={platformValue ?? "Platform details are not available."}
              relationship="description"
            >
              <span>Platform & hardware</span>
            </Tooltip>
          }
          checked={hasPlatform}
          onChange={(_, data) => setToggle("platform", !!data.checked)}
        />
      </div>

      <div className="system-prompt-editor__toolbar">
        <Button size="small" icon={<TextAddRegular />} disabled={hasText} onClick={addText}>
          Text
        </Button>
        <Button size="small" icon={<DocumentRegular />} onClick={attachFile}>
          Attach file
        </Button>
      </div>

      {blocks.map((block) => {
        if (block.kind === "text") {
          return (
            <div key={block.id} className="system-prompt-editor__block">
              <div className="system-prompt-editor__block-header">
                <Caption1 className="system-prompt-editor__kind">Text</Caption1>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<DeleteRegular />}
                  aria-label="Remove text"
                  onClick={() => removeBlock(block.id)}
                />
              </div>
              <Textarea
                className="model-settings__textarea"
                value={block.text}
                placeholder="Instructions, persona or output rules…"
                onChange={(_, data) => updateBlock(block.id, { text: data.value })}
              />
            </div>
          );
        }

        if (block.kind === "file") {
          const missing = fileInfo[block.id]?.error;
          const title = missing
            ? `${block.path}: could not be read.`
            : `${block.path} (${formatSize(block.size ?? 0)})`;
          return (
            <div key={block.id} className="system-prompt-editor__file-row">
              <Tooltip content={title} relationship="description">
                <Caption1 tabIndex={0} className="system-prompt-editor__file-name">
                  {block.name}
                </Caption1>
              </Tooltip>
              {missing && <Caption1 className="system-prompt-editor__missing">Not found</Caption1>}
              <Button
                appearance="subtle"
                size="small"
                icon={<DeleteRegular />}
                aria-label={`Remove ${block.name}`}
                onClick={() => removeBlock(block.id)}
              />
            </div>
          );
        }

        // Date & time and platform are shown as checkboxes above, not as rows.
        return null;
      })}

      {blocks.length === 0 && (
        <Caption1 className="system-prompt-editor__empty">
          Nothing added. The model gets no system prompt.
        </Caption1>
      )}

      <Caption1 className="system-prompt-editor__footer">
        About {totalTokens} tokens
        {percentOfContext != null && ` (${percentOfContext}%)`} of text, files and checked blocks
        {contextWindow != null && `, against a context window of ${contextWindow} tokens`}.
        {contextWindow != null &&
          totalTokens > contextWindow &&
          " The prompt is larger than the context window."}
      </Caption1>
    </div>
  );
}
