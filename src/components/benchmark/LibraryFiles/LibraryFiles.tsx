import { Button } from "@fluentui/react-components";
import {
  DismissRegular,
  DocumentRegular,
  ImageRegular,
  MusicNote2Regular,
} from "@fluentui/react-icons";
import type { AttachmentKind, BenchmarkFile } from "../../../types";
import { Meta } from "../../ui/Typography/Typography";
import "./LibraryFiles.css";

const FILE_KINDS: [AttachmentKind, string][] = [
  ["text", "text file"],
  ["image", "image"],
  ["audio", "audio"],
];

function FileIcon({ kind }: { kind: BenchmarkFile["kind"] }) {
  if (kind === "image") return <ImageRegular />;
  if (kind === "audio") return <MusicNote2Regular />;
  return <DocumentRegular />;
}

/** Size and length of a library file, for display. */
export function fileDetail(file: BenchmarkFile): string {
  const parts: string[] = [];
  if (file.chars != null) parts.push(`${file.chars.toLocaleString()} characters`);
  if (file.size != null) parts.push(`${(file.size / 1024).toFixed(1)} KB`);
  return parts.join(" · ");
}

/** One button per attachment kind. Disabled once `count` reaches `max`. */
export function LibraryFileButtons({
  count,
  max,
  onPick,
}: {
  count: number;
  max: number;
  onPick: (kind: AttachmentKind) => void;
}) {
  return (
    <div className="library-files__buttons">
      {FILE_KINDS.map(([kind, label]) => (
        <Button
          key={kind}
          appearance="secondary"
          size="small"
          disabled={count >= max}
          onClick={() => onPick(kind)}
        >
          Add {label}
        </Button>
      ))}
    </div>
  );
}

/** The files in a list. Pass `onRemove` to show a remove button on each row. */
export function LibraryFileList({
  files,
  label,
  onRemove,
}: {
  files: BenchmarkFile[];
  label: string;
  onRemove?: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="library-files__list" aria-label={label}>
      {files.map((file) => (
        <li key={file.id} className="library-files__file">
          <FileIcon kind={file.kind} />
          <div className="library-files__text">
            <span>{file.name}</span>
            <Meta>{fileDetail(file)}</Meta>
          </div>
          {onRemove && (
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              aria-label={`Remove ${file.name}`}
              onClick={() => onRemove(file.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
