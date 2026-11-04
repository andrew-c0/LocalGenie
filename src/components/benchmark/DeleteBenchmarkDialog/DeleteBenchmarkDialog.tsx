import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";

export type BenchmarkKind = "prompt" | "suite";

/** What deleting each kind leaves behind. Past runs keep their records in both cases. */
const CONSEQUENCES: Record<BenchmarkKind, string> = {
  prompt:
    "The prompt and its files are removed from the library. Past runs keep their records. A prompt used by a suite cannot be deleted.",
  suite:
    "The suite and its steps are removed, and so are the extra files only its steps used. Its past runs keep their records.",
};

interface DeleteBenchmarkDialogProps {
  kind: BenchmarkKind;
  /** The item's name, shown in the title. */
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The confirmation before a prompt or suite is deleted, from a list or from its item page. */
export function DeleteBenchmarkDialog({
  kind,
  name,
  onConfirm,
  onCancel,
}: DeleteBenchmarkDialogProps) {
  return (
    <ConfirmDialog
      title={`Delete ${kind} "${name}"?`}
      message={`${CONSEQUENCES[kind]} This cannot be undone.`}
      confirmLabel={`Delete ${kind}`}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
