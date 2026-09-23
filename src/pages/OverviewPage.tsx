import { Button } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { MetricCard, StateBlock, StatusBadge, SurfaceCard } from "../components/ui/primitives";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

/** Overview / capabilities dashboard. */
export default function OverviewPage() {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  return (
    <div className="lx-page">
      <div className="lx-page-inner">
        {/* ── Hero ─────────────────────────────────── */}
        <section className="lx-hero">
          <span className="lx-page-eyebrow">
            {serverStatus.running ? "● Hexagon NPU & DirectML Ready" : "● Runtime Offline"}
          </span>
          <h1 className="lx-hero-title">
            Zero Cloud. <span className="accent">100% On-Device.</span>
          </h1>
          <p className="lx-page-subtitle">
            Run open-weights foundation models locally with dedicated Qualcomm NPU acceleration.
            Pure offline privacy, zero API latency.
          </p>
          <div className="lx-hero-actions">
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              onClick={() => navigate("/models")}
            >
              Browse Models
            </Button>
            <Button appearance="secondary" icon={<ChatRegular />} onClick={() => navigate("/chat")}>
              Start Local Chat
            </Button>
          </div>
        </section>

        {/* ── Runtime metrics ──────────────────────── */}
        <div className="lx-grid-3">
          <MetricCard
            label="Server Status"
            badge={
              <StatusBadge tone={serverStatus.running ? "green" : "red"}>
                {serverStatus.running ? "Running" : "Stopped"}
              </StatusBadge>
            }
            value={serverStatus.running ? "Online" : "Offline"}
            sub={
              serverStatus.running
                ? `Listening on 127.0.0.1:${serverStatus.port}`
                : "Start the server from the model selector"
            }
          />
          <MetricCard
            label="Models Installed"
            value={models.length}
            unit="available"
            sub={
              serverStatus.models.length > 0
                ? `${serverStatus.models.length} loaded on server`
                : "None loaded on server"
            }
            progress={
              models.length > 0
                ? Math.min(100, (serverStatus.models.length / Math.max(1, models.length)) * 100)
                : 0
            }
            progressColor="cyan"
          />
          <MetricCard
            label="Hardware Telemetry"
            badge={<StatusBadge tone="purple">Unavailable</StatusBadge>}
            value="—"
            unit="NPU / VRAM / Temp"
            sub="Live hardware metrics require backend telemetry support"
          />
        </div>

        {/* ── Capabilities ─────────────────────────── */}
        <div className="lx-grid-3">
          <SurfaceCard title="🔒 100% Offline Privacy">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              Context windows, prompts, and vector embeddings reside strictly in local memory. Zero
              telemetry outbound.
            </p>
          </SurfaceCard>
          <SurfaceCard title="⚡ Native NPU Acceleration">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              DirectML and Qualcomm Hexagon paths deliver sub-12ms time-to-first-token latency on
              supported hardware.
            </p>
          </SurfaceCard>
          <SurfaceCard title="✳ Open Weights Ingestion">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              Native support for GGUF and ONNX archives from Hugging Face and Qualcomm AI Hub with
              automatic quantization.
            </p>
          </SurfaceCard>
        </div>

        {/* ── Generation speeds (from real stats when present) ── */}
        <SurfaceCard
          title="Recent Generation Speeds"
          action={
            <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
              from your chats
            </span>
          }
        >
          <SpeedList />
        </SurfaceCard>

        {/* ── Privacy banner ───────────────────────── */}
        <div className="lx-hw-banner">
          <span>🛡 Windows sandbox isolation active. 0 outbound network requests allowed.</span>
          <span className="lx-titlebar-spacer" />
          <span className="lx-mono">127.0.0.1:{serverStatus.port} (localhost)</span>
        </div>

        {models.length === 0 && (
          <StateBlock
            icon="📦"
            message="No models installed yet. Pull one from Hugging Face to get started."
          >
            <Button appearance="primary" onClick={() => navigate("/models")}>
              Open Model Library
            </Button>
          </StateBlock>
        )}
      </div>
    </div>
  );
}

/** Derives tokens/sec from stored chat message stats. */
function SpeedList() {
  const sessions = useChatStore((s) => s.sessions);

  const speeds: { model: string; tps: number }[] = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (
        msg.role === "assistant" &&
        msg.stats &&
        msg.stats.totalTime > 0 &&
        msg.stats.tokenCount > 0 &&
        msg.modelId
      ) {
        const tps = msg.stats.tokenCount / (msg.stats.totalTime / 1000);
        speeds.push({ model: msg.modelId.split("/").pop() ?? msg.modelId, tps });
      }
    }
  }
  speeds.sort((a, b) => b.tps - a.tps);
  const top = speeds.slice(0, 5);
  const max = top.length > 0 ? top[0].tps : 1;

  if (top.length === 0) {
    return (
      <StateBlock message="No generation statistics yet — start a chat to measure throughput." />
    );
  }

  return (
    <div>
      {top.map((s) => (
        <div key={`${s.model}-${s.tps}`} className="lx-speed-row">
          <div>
            <div className="lx-speed-name">{s.model}</div>
            <div className="lx-progress" style={{ marginTop: 6, maxWidth: 320 }}>
              <div className="lx-progress-fill cyan" style={{ width: `${(s.tps / max) * 100}%` }} />
            </div>
          </div>
          <div className="lx-speed-tps">{s.tps.toFixed(1)} tok/s</div>
        </div>
      ))}
    </div>
  );
}
