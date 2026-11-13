import { useState } from "react";
import type { McpServerConfig, McpTransport } from "../../../../../types";
import {
  addRow,
  changeRow,
  draftFromConfig,
  type KeyValueRow,
  type McpDraft,
  removeRow,
} from "../../../../../utils/mcpServers";

/** The two lists of name and value rows in the form. */
export type RowList = "env" | "headers";

/** What the server form reads and changes. Returned by `useMcpDraft`. */
export interface McpDraftForm {
  draft: McpDraft;
  setField: <K extends keyof McpDraft>(key: K, value: McpDraft[K]) => void;
  setTransport: (transport: McpTransport) => void;
  addRowTo: (list: RowList) => void;
  changeRowIn: (
    list: RowList,
    id: string,
    patch: Partial<Pick<KeyValueRow, "key" | "value">>,
  ) => void;
  removeRowFrom: (list: RowList, id: string) => void;
}

function newRowId(): string {
  return crypto.randomUUID();
}

/** The server form's draft, read once from the server being edited (or empty for a new one). */
export function useMcpDraft(config: McpServerConfig | null): McpDraftForm {
  const [draft, setDraft] = useState<McpDraft>(() => draftFromConfig(config, newRowId));

  const setField: McpDraftForm["setField"] = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const updateRows = (list: RowList, update: (rows: KeyValueRow[]) => KeyValueRow[]) =>
    setDraft((current) => ({ ...current, [list]: update(current[list]) }));

  return {
    draft,
    setField,
    setTransport: (transport) => setField("transport", transport),
    addRowTo: (list) => updateRows(list, (rows) => addRow(rows, newRowId)),
    changeRowIn: (list, id, patch) => updateRows(list, (rows) => changeRow(rows, id, patch)),
    removeRowFrom: (list, id) => updateRows(list, (rows) => removeRow(rows, id)),
  };
}
