import { Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { formatBytes } from "../../utils/format";

/** One selectable GGUF variant. */
interface GGUFVariant {
  filename: string;
  precision: string;
  sizeLabel: string | null;
  version: string;
  size?: number;
}

interface Props {
  repoId: string;
  variants: GGUFVariant[];
  onSelect: (variant: GGUFVariant) => void;
  onClose: () => void;
  isDownloading: boolean;
}

/** Human-readable label for a quantization precision. */
function precisionLabel(precision: string): string {
  const lower = precision.toLowerCase();
  if (lower === "f16") return "Float16 (F16)";
  if (lower === "bf16") return "Bfloat16 (BF16)";
  if (lower === "f32") return "Float32 (F32)";
  if (lower.startsWith("q2_")) return "Q2_K";
  if (lower.startsWith("q3_")) return "Q3_K";
  if (lower.startsWith("q4_")) return "Q4_K";
  if (lower.startsWith("q5_")) return "Q5_K";
  if (lower.startsWith("q6_")) return "Q6_K";
  if (lower.startsWith("q8_")) return "Q8_0";
  return precision;
}

export default function ReleaseVersionDialog({
  repoId,
  variants,
  onSelect,
  onClose,
  isDownloading,
}: Props) {
  const [selected, setSelected] = useState<GGUFVariant | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, GGUFVariant[]>();
    for (const v of variants) {
      const key = v.precision;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return map;
  }, [variants]);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="lx-card"
        role="dialog"
        aria-modal="true"
        aria-label="Select GGUF variant to download"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        style={{ minWidth: 480, maxWidth: 640, maxHeight: "80vh", overflow: "auto" }}
      >
        <button
          type="button"
          aria-label="Close dialog"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -1,
            background: "transparent",
            border: "none",
            cursor: "default",
          }}
          onClick={onClose}
        />
        <div className="lx-card-title" style={{ marginBottom: 4 }}>
          Download {repoId}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--lx-text-muted)", marginTop: 0 }}>
          Select the quantization variant to download.
        </p>

        {Array.from(grouped).map(([precision, items]) => (
          <div key={precision} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--lx-text)" }}>
                {precisionLabel(precision)}
              </span>
              <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
                {precision}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--lx-text-muted)", marginBottom: 6 }}>
              {items.length} file{items.length > 1 ? "s" : ""} available
            </div>

            {items.map((v) => {
              const isSelected = selected?.filename === v.filename;
              return (
                <div
                  key={v.filename}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--lx-outline)",
                    background: isSelected ? "var(--lx-neutral-subtle)" : "transparent",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12.5 }}>{v.filename}</div>
                    <div style={{ fontSize: 11.5, color: "var(--lx-text-muted)" }}>
                      {v.sizeLabel ? `${v.sizeLabel} · ` : ""}
                      {v.version}
                      {v.size ? ` · ${formatBytes(v.size)}` : ""}
                    </div>
                  </div>
                  <Button
                    size="small"
                    appearance={isSelected ? "primary" : "subtle"}
                    icon={isDownloading ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                    disabled={isDownloading || isSelected}
                    onClick={() => setSelected(v)}
                  >
                    {isDownloading ? "Pulling…" : isSelected ? "Selected" : "Download"}
                  </Button>
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Button appearance="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            onClick={() => {
              if (selected) onSelect(selected);
            }}
            disabled={!selected || isDownloading}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}