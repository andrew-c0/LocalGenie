import { Button, Dropdown, Option, Spinner } from "@fluentui/react-components";
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
import { StateBlock, StatusBadge } from "../../components/ui/primitives";
import { cleanupDownloadedFile, downloadFile, importGGUF } from "../../services/download";
import {
  estimateModelBytes,
  fetchHubModelReadme,
  getHubModel,
  type HubFileEntry,
  type HubModel,
  hubModelPageUrl,
  listHubModelFiles,
  modelTagChips,
  precisionInfo,
  ramFitForBytes,
} from "../../services/hubApi";
import type { GGUFFile } from "../../services/hubModels";
import type { SystemMemoryInfo } from "../../services/system";
import { getSystemMemory } from "../../services/system";
import { formatBytes, formatCount } from "../../utils/format";
import { parseGGUFFilename } from "../../utils/gguf";

interface Props {
  /** RepoIds for which a download is in progress. */
  downloading: Set<string>;
}

/** Grouped GGUF files: main file + its associated sidecars (mmproj, mtp, etc.) */
interface GGUFGroup {
  main: GGUFFile;
  sidecars: GGUFFile[];
}

const convertToGGUFFiles = (entries: HubFileEntry[]): GGUFFile[] => {
  const result: GGUFFile[] = [];
  for (const e of entries) {
    if (e.type !== "file") continue;
    const parsed = parseGGUFFilename(e.path);
    if (!parsed) continue;
    result.push({
      filename: e.path,
      precision: parsed.encoding ?? "unknown",
      sizeLabel: parsed.sizeLabel,
      version: parsed.version,
      shard: parsed.shard,
      size: e.size,
    });
  }
  return result;
};

/** Group GGUF files: each non-sidecar file is its own group, sidecars are attached to their matching main file */
const groupGGUFFiles = (files: GGUFFile[]): GGUFGroup[] => {
  const mainFiles: GGUFFile[] = [];
  const sidecarFiles: GGUFFile[] = [];

  /** Check if filename indicates a sidecar (mmproj/mtp) anywhere in the name */
  const isSidecarFilename = (filename: string): boolean => {
    const name = filename.replace(/\.gguf$/i, "");
    return name.includes("-mmproj-") || name.includes("-mtp-");
  };

  /** Normalize fineTune for matching by stripping -mmproj / -mtp segments */
  const normalizeFineTune = (fineTune: string | null): string => {
    if (!fineTune) return "";
    return fineTune.replace(/-mmproj/g, "").replace(/-mtp/g, "");
  };

  for (const f of files) {
    const parsed = parseGGUFFilename(f.filename);
    if (!parsed) continue;
    // Sidecar if: regex detected prefix sidecar, OR filename contains -mmproj-/-mtp- (middle pattern)
    if (parsed.sidecar !== null || isSidecarFilename(f.filename)) {
      sidecarFiles.push(f);
    } else {
      mainFiles.push(f);
    }
  }

  // Sort main files by size, ascending
  mainFiles.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  // Each main file gets its own group
  const groups: GGUFGroup[] = mainFiles.map((main) => ({ main, sidecars: [] }));

  // Attach sidecars to the matching main file (same baseName + normalized fineTune + version + encoding)
  for (const sidecar of sidecarFiles) {
    const parsed = parseGGUFFilename(sidecar.filename);
    if (!parsed) continue;
    const match = groups.find((g) => {
      const mainParsed = parseGGUFFilename(g.main.filename);
      if (!mainParsed) return false;
      return (
        mainParsed.baseName === parsed.baseName &&
        normalizeFineTune(mainParsed.fineTune) === normalizeFineTune(parsed.fineTune) &&
        mainParsed.version === parsed.version &&
        mainParsed.encoding === parsed.encoding
      );
    });
    if (match) {
      match.sidecars.push(sidecar);
    }
  }

  return groups;
};

const getChipStyle = (bits: number) => ({
  backgroundColor:
    bits <= 4 ? "#4caf50" : bits <= 6 ? "#ff9800" : bits <= 8 ? "#2196f3" : "#9c27b0",
  color: "#fff",
  padding: "2px 6px",
  borderRadius: "3px",
  fontSize: "11px",
  fontWeight: 600,
  marginRight: "6px",
});

export default function HubModelDetail({ downloading }: Props) {
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<HubModel | null>(null);
  const [files, setFiles] = useState<HubFileEntry[]>([]);
  const [readme, setReadme] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<GGUFGroup | null>(null);
  const [ggufGroups, setGgufGroups] = useState<GGUFGroup[]>([]);
  const [systemMemory, setSystemMemory] = useState<SystemMemoryInfo | null>(null);
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
    setSelectedVariant(null);
    setGgufGroups([]);
    (async () => {
      try {
        const m = await getHubModel(repoId);
        if (cancelled) return;
        setModel(m);
        listHubModelFiles(repoId)
          .then((f) => !cancelled && setFiles(f))
          .catch(() => undefined);
        fetchHubModelReadme(repoId)
          .then((r) => !cancelled && setReadme(r))
          .catch(() => undefined);
        listHubModelFiles(repoId)
          .then((all) => {
            if (cancelled) return;
            const ggufFiles = convertToGGUFFiles(all);
            setGgufGroups(groupGGUFFiles(ggufFiles));
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
  }, [repoId]);

  // Load system memory info once
  useEffect(() => {
    let cancelled = false;
    getSystemMemory()
      .then((mem) => !cancelled && setSystemMemory(mem))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
  const paramsCount = model?.safetensors?.parameters ?? null;
  // GGUF files have actual size — compute RAM fit directly from file size (with overhead for KV cache/activations)
  const estimateRamFitFromFileSize = (fileSize: number) => {
    if (!fileSize || !systemMemory) return null;
    const neededBytes = Math.round(fileSize * 1.15);
    return ramFitForBytes(neededBytes, systemMemory);
  };
  const estimateMemoryRequirement = (bits: number | null) => {
    if (paramsCount == null || bits == null) return null;
    const neededBytes = estimateModelBytes(paramsCount, bits);
    if (!neededBytes || !systemMemory) return null;
    return ramFitForBytes(neededBytes, systemMemory);
  };

  const handleDownload = async (group: GGUFGroup) => {
    const url = `https://huggingface.co/${repoId}/resolve/main/${group.main.filename}`;
    const fileName = group.main.filename.split("/").pop() ?? group.main.filename;

    // Download main GGUF to Downloads folder
    const downloadedPath = await downloadFile(
      url,
      fileName,
      group.main.precision ?? undefined,
    ).catch(() => undefined);
    if (downloadedPath) {
      // Import into GenieX cache
      try {
        await importGGUF(downloadedPath, repoId, fileName, group.main.precision);
        // Cleanup the downloaded file after successful import
        await cleanupDownloadedFile(downloadedPath);
      } catch (e) {
        console.error("Failed to import GGUF into GenieX cache:", e);
        // Keep the file for retry
      }
    }

    // Download all sidecars (they don't need to be imported, just downloaded)
    for (const sidecar of group.sidecars) {
      const sideUrl = `https://huggingface.co/${repoId}/resolve/main/${sidecar.filename}`;
      const sideName = sidecar.filename.split("/").pop() ?? sidecar.filename;
      await downloadFile(sideUrl, sideName).catch(() => undefined);
    }
  };

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
            {model.pipeline_tag && (
              <div style={{ marginTop: 6 }}>
                <StatusBadge>{model.pipeline_tag}</StatusBadge>
              </div>
            )}
          </div>
          <div className="lx-page-actions">
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

        {/* ── Model name + Precision dropdown ────────────────────── */}
        {ggufGroups.length > 0 && (
          <div className="lx-precision-dropdown" style={{ marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
              role="group"
              aria-label="Select GGUF variant"
            >
              <span className="lx-chip lx-model-chip">{model.id}</span>

              <Dropdown
                selectedOptions={selectedVariant ? [selectedVariant.main.filename] : []}
                onOptionSelect={(_, data) => {
                  const selected = ggufGroups.find((g) => g.main.filename === data.optionValue);
                  setSelectedVariant(selected ?? null);
                }}
                className="lx-precision-select"
                aria-label="Select GGUF precision"
              >
                <Option text="Select precision…" value="">
                  Select precision…
                </Option>
                {ggufGroups.map((group) => {
                  const info = precisionInfo(group.main.precision);
                  const labelParts = [info.label];
                  if (group.main.sizeLabel) labelParts.push(group.main.sizeLabel);
                  else if (group.main.version) labelParts.push(group.main.version);
                  const bits = info.bitsPerWeight ?? 4;
                  const chipStyle = getChipStyle(bits);
                  const hasSidecar = group.sidecars.length > 0;
                  const ramFit =
                    estimateRamFitFromFileSize(group.main.size ?? 0) ??
                    estimateMemoryRequirement(bits);

                  // RAM fit chip only when we have enough info to calculate it
                  const ramChip = ramFit ? (
                    <span
                      className="lx-chip"
                      style={{
                        backgroundColor:
                          ramFit.level === "fits"
                            ? "#4caf50"
                            : ramFit.level === "tight"
                              ? "#ff9800"
                              : "#f44336",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {ramFit.level === "fits" ? "✓" : ramFit.level === "tight" ? "⚠" : "✗"}{" "}
                      {ramFit.label}
                    </span>
                  ) : (
                    <span
                      className="lx-chip"
                      style={{
                        backgroundColor: "#999",
                        color: "#666",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      N/A
                    </span>
                  );

                  return (
                    <Option
                      key={group.main.filename}
                      value={group.main.filename}
                      text={`${labelParts.join(" — ")} — ${formatBytes(group.main.size)}`}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={chipStyle} className="lx-chip">
                          {labelParts.join(" — ")}
                        </span>
                        {hasSidecar && (
                          <span
                            className="lx-chip"
                            style={{
                              backgroundColor: "#6366f1",
                              color: "#fff",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            +{group.sidecars.length} sidecar
                          </span>
                        )}
                        {ramChip}
                        <span style={{ marginLeft: 8 }}>— {formatBytes(group.main.size)}</span>
                      </span>
                    </Option>
                  );
                })}
              </Dropdown>

              <Button
                appearance="primary"
                icon={isDownloading ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                disabled={!selectedVariant || isDownloading}
                onClick={() => selectedVariant && handleDownload(selectedVariant)}
              >
                {isDownloading ? "Pulling…" : "Download"}
              </Button>
            </div>
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
      </div>
    </div>
  );
}
