import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import ReleaseVersionDialog from "../../components/models/ReleaseVersionDialog";
import { StateBlock, StatusBadge } from "../../components/ui/primitives";
import * as geniex from "../../services/geniex";
import {
  assetCompatibility,
  fetchHubModelReadme,
  fetchReleaseAssets,
  getHubModel,
  type HubFileEntry,
  type HubModel,
  hubModelPageUrl,
  listHubModelFiles,
  matchChipsetSlugs,
  modelTagChips,
  type ReleaseAsset,
  type ReleaseAssets,
  singleDownloadOption,
} from "../../services/hubApi";
import { useHubBrowseStore } from "../../stores/hubBrowseStore";
import { formatBytes, formatCount } from "../../utils/format";

interface Props {
  /** Called when the user downloads the model from the detail page. */
  onDownload: (repoId: string) => void;
  /** Called when the user picks a specific release asset to download. */
  onDownloadAsset: (repoId: string, asset: ReleaseAsset, precision: string) => void;
  downloading: Set<string>;
}

/**
 * Model detail subpage (`/models/:repoId`) — loads the model page from
 * Hugging Face: metadata, tags, file tree and README.
 */
export default function HubModelDetail({ onDownload, onDownloadAsset, downloading }: Props) {
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const compatibleNames = useHubBrowseStore((s) => s.compatibleNames);
  const setAssetCompat = useHubBrowseStore((s) => s.setAssetCompat);
  const [model, setModel] = useState<HubModel | null>(null);
  const [files, setFiles] = useState<HubFileEntry[]>([]);
  const [readme, setReadme] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseAssets | null>(null);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [chipsetSlugs, setChipsetSlugs] = useState<string[]>([]);
  const [singleOption, setSingleOption] = useState<{
    asset: ReleaseAsset;
    precision: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setModel(null);
    setFiles([]);
    setReadme(null);
    setRelease(null);
    setShowVersionDialog(false);
    setSingleOption(null);
    (async () => {
      try {
        const m = await getHubModel(repoId);
        if (cancelled) return;
        setModel(m);
        // Non-blocking extras: file tree + README.
        listHubModelFiles(repoId)
          .then((f) => !cancelled && setFiles(f))
          .catch(() => undefined);
        fetchHubModelReadme(repoId)
          .then((r) => !cancelled && setReadme(r))
          .catch(() => undefined);
        fetchReleaseAssets(repoId)
          .then((r) => {
            if (cancelled || !r) return;
            setRelease(r);
            // Match the device chipset (from `geniex config get chipset`)
            // against the asset chipset slugs to pre-filter the dialog.
            const slugs = r.precisions.flatMap((p) => Object.keys(p.chipset_assets));
            geniex
              .configGet("chipset")
              .then((device) => {
                const matched = matchChipsetSlugs(device, slugs);
                setChipsetSlugs(matched);
                // Share the learned compatibility with the browse tiles.
                setAssetCompat(repoId, assetCompatibility(r, matched));
                // Single precision/variant → skip the dialog entirely.
                setSingleOption(singleDownloadOption(r, matched));
              })
              .catch(() => {
                const matched = matchChipsetSlugs(null, slugs);
                setChipsetSlugs(matched);
                setAssetCompat(repoId, assetCompatibility(r, matched));
                setSingleOption(singleDownloadOption(r, matched));
              });
          })
          .catch(() => undefined);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, setAssetCompat]);

  if (loading) {
    return (
      <div className="lx-page">
        <div className="lx-page-inner">
          <StateBlock icon="⏳" message={`Loading ${repoId} from Hugging Face…`} />
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="lx-page">
        <div className="lx-page-inner">
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate("/models")}
          >
            Back to Models
          </Button>
          <StateBlock icon="⚠️" message={error ?? "Model not found."} />
        </div>
      </div>
    );
  }

  const isDownloading = downloading.has(model.id);

  return (
    <div className="lx-page">
      <div className="lx-page-inner">
        {/* ── Header ───────────────────────────────── */}
        <div className="lx-page-headrow">
          <div>
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowLeftRegular />}
              onClick={() => navigate("/models")}
            >
              Back to Models
            </Button>
            <h1 className="lx-page-title lx-mono" style={{ marginTop: 8 }}>
              {model.id}
            </h1>
            <p className="lx-page-subtitle">
              ⬇ {formatCount(model.downloads)} downloads · ❤ {formatCount(model.likes)} likes
              {model.lastModified &&
                ` · Updated ${new Date(model.lastModified).toLocaleDateString()}`}
              {model.gated ? " · 🔒 gated" : ""}
            </p>
            {compatibleNames && (
              <div style={{ marginTop: 6 }}>
                {compatibleNames.has(model.id) ? (
                  <StatusBadge tone="green">NPU ready — direct pull</StatusBadge>
                ) : (
                  <StatusBadge>Not in GenieX list — check release assets</StatusBadge>
                )}
              </div>
            )}
          </div>
          <div className="lx-page-actions">
            <Button
              appearance="primary"
              icon={isDownloading ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
              disabled={isDownloading}
              onClick={() => {
                // NPU-ready models pull directly via the CLI — no version
                // dialog needed even if release assets exist.
                if (compatibleNames?.has(model.id) || !release) {
                  onDownload(model.id);
                } else if (singleOption) {
                  // Only one precision/variant — download it right away.
                  onDownloadAsset(model.id, singleOption.asset, singleOption.precision);
                } else {
                  setShowVersionDialog(true);
                }
              }}
            >
              {isDownloading ? "Pulling…" : "Download"}
            </Button>
            <Button
              appearance="subtle"
              icon={<OpenRegular />}
              onClick={() =>
                open(hubModelPageUrl(model.id)).catch((err) =>
                  console.error("Failed to open browser:", err),
                )
              }
            >
              Open on Hugging Face
            </Button>
          </div>
        </div>

        {/* ── Tag chips ────────────────────────────── */}
        {modelTagChips(model).length > 0 && (
          <div className="lx-chiprow">
            {modelTagChips(model).map((tag) => (
              <span key={tag} className="lx-chip" style={{ cursor: "default" }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Files (collapsible, collapsed by default) ── */}
        {files.length > 0 && (
          <div className="lx-card">
            <button
              type="button"
              className="lx-files-toggle"
              aria-expanded={filesOpen}
              onClick={() => setFilesOpen((v) => !v)}
            >
              {filesOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
              <span className="lx-card-title">Files ({files.length})</span>
            </button>
            {filesOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {files.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      padding: "2px 0",
                    }}
                  >
                    <span className="lx-mono">
                      {f.type === "directory" ? "📁" : "📄"} {f.path}
                    </span>
                    <span style={{ color: "var(--lx-text-muted)" }}>{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── README ───────────────────────────────── */}
        <div className="lx-card">
          <div className="lx-card-title">Model Card</div>
          {readme ? (
            <div className="lx-readme">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                components={{
                  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                }}
              >
                {readme}
              </ReactMarkdown>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--lx-text-muted)", margin: 0 }}>
              No README available for this model.
            </p>
          )}
        </div>

        {/* ── Version selection popup ──────────────── */}
        {showVersionDialog && release && (
          <ReleaseVersionDialog
            modelId={model.id}
            release={release}
            chipsetSlugs={chipsetSlugs}
            isDownloading={isDownloading}
            onSelect={(asset, precision) => {
              setShowVersionDialog(false);
              onDownloadAsset(model.id, asset, precision);
            }}
            onClose={() => setShowVersionDialog(false)}
          />
        )}
      </div>
    </div>
  );
}
