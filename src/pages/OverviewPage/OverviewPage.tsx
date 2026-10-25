import { Button, Card, CardHeader } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { SpeedList } from "../../components/benchmark/SpeedList/SpeedList";
import { MetricCard } from "../../components/ui/MetricCard/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { CardTitle, Meta } from "../../components/ui/Typography/Typography";
import { useModelStore } from "../../stores/modelStore";
import "./OverviewPage.css";

/** Overview dashboard: server state, installed models and recent generation speeds. */
export default function OverviewPage() {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  return (
    <div className="overview-page__page">
      <div className="overview-page__inner">
        <PageHeader
          eyebrow="● OVERVIEW"
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
            value={serverStatus.running ? "Running" : "Stopped"}
            sub={
              serverStatus.running
                ? `${serverStatus.models.length} loaded on server`
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
        </div>

        <Card>
          <CardHeader
            header={<CardTitle>Recent Generation Speeds</CardTitle>}
            action={<Meta>from your chats</Meta>}
          />
          <SpeedList />
        </Card>

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
