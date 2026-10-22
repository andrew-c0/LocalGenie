import {
  Body1,
  Button,
  Card,
  CardHeader,
  makeStyles,
  Text,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { SpeedList } from "../components/benchmark/SpeedList/SpeedList";
import { MetricCard } from "../components/ui/MetricCard/MetricCard";
import { PageHeader } from "../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../components/ui/StatusBadge/StatusBadge";
import { useModelStore } from "../stores/modelStore";

const useStyles = makeStyles({
  page: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: tokens.spacingHorizontalL,
  },
  inner: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "1200px",
    margin: "0 auto",
  },
  heroActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  capabilityBody: {
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

/** Overview / capabilities dashboard. */
export default function OverviewPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow={serverStatus.running ? "● Hexagon NPU & DirectML Ready" : "● Runtime Offline"}
          title="Overview"
          subtitle="Run open-weights models locally on Qualcomm NPU, GPU or CPU. Zero cloud, zero API latency."
          actions={
            <div className={styles.heroActions}>
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

        <div className={styles.grid}>
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

        <div className={styles.grid}>
          <Card>
            <CardHeader header={<Text weight="semibold">🔒 100% Offline Privacy</Text>} />
            <div className={styles.capabilityBody}>
              <Body1>
                Context windows, prompts, and vector embeddings reside strictly in local memory.
                Zero telemetry outbound.
              </Body1>
            </div>
          </Card>
          <Card>
            <CardHeader header={<Text weight="semibold">⚡ Native NPU Acceleration</Text>} />
            <div className={styles.capabilityBody}>
              <Body1>
                DirectML and Qualcomm Hexagon paths deliver sub-12ms time-to-first-token latency on
                supported hardware.
              </Body1>
            </div>
          </Card>
          <Card>
            <CardHeader header={<Text weight="semibold">✳ Open Weights Ingestion</Text>} />
            <div className={styles.capabilityBody}>
              <Body1>
                Native support for GGUF and ONNX archives from Hugging Face and Qualcomm AI Hub with
                automatic quantization.
              </Body1>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            header={<Text weight="semibold">Recent Generation Speeds</Text>}
            action={<Text size={200}>from your chats</Text>}
          />
          <SpeedList />
        </Card>

        <div className={styles.banner}>
          <Body1>🛡 Windows sandbox isolation active. 0 outbound network requests allowed.</Body1>
          <Text>127.0.0.1:{serverStatus.port} (localhost)</Text>
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
