import { Button, MessageBar, MessageBarActions, MessageBarBody } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import * as systemService from "../../../services/system";
import { defaultSettings, useModelStore } from "../../../stores/modelStore";
import { modelSettingsKey } from "../../../utils/modelSettings";
import { withSystemBlocks } from "../../../utils/systemPrompt";

/**
 * Warns in a new chat when the loaded model's system prompt attaches files that are no longer
 * on disk. The send is not blocked: missing files are left out of the prompt.
 */
export default function MissingFileBanner() {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const navigate = useNavigate();
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!activeModelId) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    db.loadModelSettings(modelSettingsKey(activeModelId))
      .then(async (saved) => {
        const stored = withSystemBlocks({ ...defaultSettings, ...saved });
        const files = (stored.systemBlocks ?? []).flatMap((b) => (b.kind === "file" ? [b] : []));
        // A check that fails is treated as present, so only a confirmed missing file warns.
        const present = await Promise.all(
          files.map((f) => systemService.fileExists(f.path).catch(() => true)),
        );
        return files.filter((_, i) => !present[i]).map((f) => f.name);
      })
      .catch(() => [] as string[])
      .then((names) => {
        if (!cancelled) setMissing(names);
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelId]);

  if (missing.length === 0) return null;

  return (
    <MessageBar intent="warning" layout="multiline">
      <MessageBarBody>
        The system prompt for this model attaches a file that is no longer found:{" "}
        {missing.join(", ")}. It is left out of the prompt until the file is back or the attachment
        is removed.
      </MessageBarBody>
      <MessageBarActions>
        <Button size="small" onClick={() => navigate("/settings/inference")}>
          Open model settings
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}
