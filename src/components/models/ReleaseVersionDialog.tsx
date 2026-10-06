import { Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import type { ReleaseAsset, ReleaseAssets } from "../../services/hubApi";

/** Runtime display label. */
function runtimeLabel(runtime: string): string {
  if (runtime === "geniex_qairt") return "GenieX QAIRT (NPU)";
  if (runtime === "geniex_llamacpp") return "GenieX llama.cpp";
  if (runtime === "genie") return "Genie (QAIRT)";
  if (runtime === "onnx") return "ONNX";
  return runtime;
}

/** Human-readable chipset label from a slug like `qualcomm-snapdragon-x-elite`. */
function chipsetLabel(slug: string): string {
  return slug
    .replace(/^qualcomm-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface Props {
  modelId: string;
  release: ReleaseAssets;
  /** Chipset slugs to show (matched to the device CPU). */
  chipsetSlugs: string[];
  /** Called with the chosen asset's download URL. */
  onSelect: (asset: ReleaseAsset, precision: string) => void;
  onClose: () => void;
  isDownloading: boolean;
}

/**
 * Modal popup listing the precisions and chipset/runtime variants from
 * release_assets.json so the user can pick which version to download.
 */
export default function ReleaseVersionDialog({
  modelId,
  release,
  chipsetSlugs,
  onSelect,
  onClose,
  isDownloading,
}: Props) {
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
        aria-label="Select version to download"
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
          Download {modelId}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--lx-text-muted)", marginTop: 0 }}>
          Release v{release.version} — select precision and chipset variant.
        </p>

        {release.precisions.map((p) => (
          <div key={p.precision} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--lx-text)",
                marginBottom: 6,
              }}
            >
              Precision: {p.precision}
            </div>

            {/* Universal assets (chipset-independent, e.g. GGUF) */}
            {Object.entries(p.universal_assets).map(([runtime, assets]) =>
              assets.map((asset) => (
                <div
                  key={`u-${runtime}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--lx-outline)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12.5 }}>{runtimeLabel(runtime)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--lx-text-muted)" }}>
                      Universal — all devices
                    </div>
                  </div>
                  <Button
                    size="small"
                    appearance="primary"
                    icon={isDownloading ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                    disabled={isDownloading}
                    onClick={() => onSelect(asset, p.precision)}
                  >
                    Download
                  </Button>
                </div>
              )),
            )}

            {/* Chipset-specific assets — only those matching the device */}
            {Object.entries(p.chipset_assets)
              .filter(([chipset]) => chipsetSlugs.includes(chipset))
              .map(([chipset, assets]) =>
                assets.map((asset) => (
                  <div
                    key={`c-${chipset}-${asset.runtime}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--lx-outline)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12.5 }}>
                        {runtimeLabel(asset.runtime)} — {chipsetLabel(chipset)}
                      </div>
                      {asset.tool_versions?.qairt && (
                        <div style={{ fontSize: 11.5, color: "var(--lx-text-muted)" }}>
                          QAIRT {asset.tool_versions.qairt}
                        </div>
                      )}
                    </div>
                    <Button
                      size="small"
                      appearance="primary"
                      icon={isDownloading ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                      disabled={isDownloading}
                      onClick={() => onSelect(asset, p.precision)}
                    >
                      Download
                    </Button>
                  </div>
                )),
              )}
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <Button appearance="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
