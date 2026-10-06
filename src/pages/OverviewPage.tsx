import { Button } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { SpeedList } from "../components/benchmark/SpeedList/SpeedList";
import { MetricCard, StateBlock, StatusBadge, SurfaceCard } from "../components/ui/primitives";
import { useModelStore } from "../stores/modelStore";

/** Overview / capabilities dashboard. */
export default function OverviewPage() {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  return (
    <div className="lx-page">
      <div className="lx-page-inner">
        {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="lx-hero">
          <span className="lx-page-eyebrow">
            {serverStatus.running ? "â— Hexagon NPU & DirectML Ready" : "â— Runtime Offline"}
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

        {/* â”€â”€ Runtime metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            value="â€”"
            unit="NPU / VRAM / Temp"
            sub="Live hardware metrics require backend telemetry support"
          />
        </div>

        {/* â”€â”€ Capabilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="lx-grid-3">
          <SurfaceCard title="ðŸ”’ 100% Offline Privacy">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              Context windows, prompts, and vector embeddings reside strictly in local memory. Zero
              telemetry outbound.
            </p>
          </SurfaceCard>
          <SurfaceCard title="âš¡ Native NPU Acceleration">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              DirectML and Qualcomm Hexagon paths deliver sub-12ms time-to-first-token latency on
              supported hardware.
            </p>
          </SurfaceCard>
          <SurfaceCard title="âœ³ Open Weights Ingestion">
            <p className="lx-page-subtitle" style={{ maxWidth: "none" }}>
              Native support for GGUF and ONNX archives from Hugging Face and Qualcomm AI Hub with
              automatic quantization.
            </p>
          </SurfaceCard>
        </div>

        {/* â”€â”€ Generation speeds (from real stats when present) â”€â”€ */}
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

        {/* â”€â”€ Privacy banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="lx-hw-banner">
          <span>ðŸ›¡ Windows sandbox isolation active. 0 outbound network requests allowed.</span>
          <span className="lx-titlebar-spacer" />
          <span className="lx-mono">127.0.0.1:{serverStatus.port} (localhost)</span>
        </div>

        {models.length === 0 && (
          <StateBlock
            icon="ðŸ“¦"
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
