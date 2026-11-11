import { Button, Field, Input } from "@fluentui/react-components";
import { AddRegular, FolderOpenRegular } from "@fluentui/react-icons";
import { useState } from "react";
import * as systemService from "../../../../services/system";
import { useToolStore } from "../../../../stores/toolStore";
import { toast } from "../../../../utils/toast";
import { type FolderProblem, folderDraftProblem } from "../../../../utils/toolAccess";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta, Secondary } from "../../../ui/Typography/Typography";
import "./AllowedFoldersCard.css";

const PROBLEM_TEXT: Record<FolderProblem, string> = {
  relative: "Type the full path, starting with a drive letter (C:\\...) or a slash (/).",
  duplicate: "This folder is already allowed.",
};

/**
 * The folders the file tools may read. A folder is chosen in the folder dialog or typed as a full
 * path. Removing a folder only changes the list; no file is touched.
 */
export function AllowedFoldersCard() {
  const folders = useToolStore((s) => s.allowedFolders);
  const addFolder = useToolStore((s) => s.addFolder);
  const removeFolder = useToolStore((s) => s.removeFolder);
  const [draft, setDraft] = useState("");

  const problem = folderDraftProblem(folders, draft);
  const canAdd = draft.trim() !== "" && problem === null;

  const handleAdd = async () => {
    if (!canAdd) return;
    if (await addFolder(draft)) setDraft("");
  };

  const handleChoose = async () => {
    try {
      const path = await systemService.pickFolder();
      if (path) await addFolder(path);
    } catch (err) {
      toast.error("Could not open the folder dialog", String(err));
    }
  };

  return (
    <SurfaceCard title="Folders the file tools may read">
      <Flex direction="column" gap="m">
        <Secondary>File tools read only inside these folders.</Secondary>
        <div>
          <Button
            appearance="primary"
            icon={<FolderOpenRegular />}
            onClick={() => void handleChoose()}
          >
            Choose folder…
          </Button>
        </div>

        {folders.length === 0 ? (
          <Meta>No folders allowed yet. File tools cannot read anything.</Meta>
        ) : (
          <Flex direction="column" gap="s">
            {folders.map((folder) => (
              <Flex key={folder} align="center" gap="s">
                <div className="flex-grow allowed-folders__path">
                  <Body>{folder}</Body>
                </div>
                <Button
                  size="small"
                  appearance="secondary"
                  aria-label={`Remove ${folder}`}
                  onClick={() => void removeFolder(folder)}
                >
                  Remove
                </Button>
              </Flex>
            ))}
          </Flex>
        )}

        <Flex align="end" gap="s">
          <div className="flex-grow allowed-folders__input">
            <Field
              label="Folder path"
              hint="The full path of a folder on this device, for example C:\Users\you\Documents."
              validationState={problem ? "error" : "none"}
              validationMessage={problem ? PROBLEM_TEXT[problem] : undefined}
            >
              <Input
                value={draft}
                placeholder="C:\Users\you\Documents"
                onChange={(_, data) => setDraft(data.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAdd();
                }}
              />
            </Field>
          </div>
          <Button
            appearance="secondary"
            icon={<AddRegular />}
            disabled={!canAdd}
            onClick={() => void handleAdd()}
          >
            Add folder
          </Button>
        </Flex>
      </Flex>
    </SurfaceCard>
  );
}
