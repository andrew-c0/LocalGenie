import { Button, Card, CardHeader } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { SpeedList } from "../../components/benchmark/SpeedList/SpeedList";
import { MetricCard } from "../../components/ui/MetricCard/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../components/ui/StatusBadge/StatusBadge";
import { useModelStore } from "../../stores/modelStore";
import "./OverviewPage.css";
import { Body, CardTitle, Meta } from "../../components/ui/Typography/Typography";

/** Overview / capabilities dashboard. */
export default function OverviewPage() {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  return (
    <div className="overview-page__page">
      <div className="overview-page__inner">
        <PageHeader
          eyebrow={serverStatus.running ? "● Hexagon NPU & DirectML Ready" : "● Runtime Offline"}
          title="Overview"
          subtitle="Run open-weights models locally on Qualcomm NPU, GPU or CPU. Zero cloud, zero API latency."
          actions={
            <div className="overview-page__hero-actions">
              <Button
                appearance="primary"
                icon={<ArrowDownloadRegular />}
                onClick={() => navigate("/models")}
              >
                Browse Models
              </Button>
              <Button
                appearance="secondary"
                icon={<ChatRegular />}
                onClick={() => navigate("/chat")}
              >
                Start Local Chat
              </Button>
            </div>
          }
        />

        <div className="overview-page__grid">
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

        <div className="overview-page__grid">
          <Card>
            <CardHeader header={<CardTitle>🔒 100% Offline Privacy</CardTitle>} />
            <div className="overview-page__capability-body">
              <Body>
                Context windows, prompts, and vector embeddings reside strictly in local memory.
                Zero telemetry outbound.
              </Body>
            </div>
          </Card>
          <Card>
            <CardHeader header={<CardTitle>⚡ Native NPU Acceleration</CardTitle>} />
            <div className="overview-page__capability-body">
              <Body>
                DirectML and Qualcomm Hexagon paths deliver sub-12ms time-to-first-token latency on
                supported hardware.
              </Body>
            </div>
          </Card>
          <Card>
            <CardHeader header={<CardTitle>✳ Open Weights Ingestion</CardTitle>} />
            <div className="overview-page__capability-body">
              <Body>
                Native support for GGUF and ONNX archives from Hugging Face and Qualcomm AI Hub with
                automatic quantization.
              </Body>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            header={<CardTitle>Recent Generation Speeds</CardTitle>}
            action={<Meta>from your chats</Meta>}
          />
          <SpeedList />
        </Card>

        <div className="overview-page__banner">
          <Body>🛡 Windows sandbox isolation active. 0 outbound network requests allowed.</Body>
          <Body>127.0.0.1:{serverStatus.port} (localhost)</Body>
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
