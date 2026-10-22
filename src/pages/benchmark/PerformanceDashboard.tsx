import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  PlayRegular,
  StopRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import ThroughputChart from "../../components/benchmark/ThroughputChart";
import { MetricCard } from "../../components/ui/MetricCard/MetricCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { ProgressBar } from "../../components/ui/ProgressBar/ProgressBar";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../components/ui/StatusBadge/StatusBadge";
import { SurfaceCard } from "../../components/ui/SurfaceCard/SurfaceCard";
import { useBenchmarkStore } from "../../stores/benchmarkStore";
import { useChatStore } from "../../stores/chatStore";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
    gap: tokens.spacingHorizontalM,
    alignItems: "start",
  },
  legend: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
  },
  legendNpu: { color: tokens.colorPaletteTealForeground2 },
  legendGpu: { color: tokens.colorPalettePurpleForeground2 },
  legendCpu: { color: tokens.colorNeutralForeground3 },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ":last-child": { borderBottom: "none" },
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
});

/**
 * Benchmark & performance dashboard. Live KPIs are derived from real chat
 * generation stats; hardware-level metrics (bandwidth, thermals) are shown as
 * unavailable until backend telemetry exists.
 *
 * Rendered as a nested route of the Benchmark Suite (`PromptBenchmarkPage`).
 */
export default function PerformanceDashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const sessions = useChatStore((s) => s.sessions);

  const status = useBenchmarkStore((s) => s.status);
  const samples = useBenchmarkStore((s) => s.samples);
  const kpis = useBenchmarkStore((s) => s.kpis);
  const runs = useBenchmarkStore((s) => s.runs);
  const setStatus = useBenchmarkStore((s) => s.setStatus);

  /** Aggregate real stats from chat history into KPIs + ranking. */
  const { ranking, avgTps, avgTtft } = (() => {
    const perModel = new Map<string, { tps: number; ttft: number; n: number }>();
    for (const session of sessions) {
      for (const msg of session.messages) {
        const st = msg.stats;
        if (msg.role !== "assistant" || !st || !msg.modelId || st.totalTime <= 0) continue;
        const name = msg.modelId.split("/").pop() ?? msg.modelId;
        const tps = st.tokenCount / (st.totalTime / 1000);
        const cur = perModel.get(name) ?? { tps: 0, ttft: 0, n: 0 };
        cur.tps += tps;
        cur.ttft += st.timeToFirstToken;
        cur.n += 1;
        perModel.set(name, cur);
      }
    }
    const ranking = [...perModel.entries()]
      .map(([model, v]) => ({ model, tokensPerSec: v.tps / v.n, ttft: v.ttft / v.n, n: v.n }))
      .sort((a, b) => b.tokensPerSec - a.tokensPerSec);
    const avgTps =
      ranking.length > 0 ? ranking.reduce((s, r) => s + r.tokensPerSec, 0) / ranking.length : null;
    const avgTtft =
      ranking.length > 0 ? ranking.reduce((s, r) => s + r.ttft, 0) / ranking.length : null;
    return { ranking, avgTps, avgTtft };
  })();

  const handleRunStop = () => {
    if (status === "running") {
      setStatus("idle");
    } else {
      setStatus("running");
      // Real benchmark execution requires backend support; running state is
      // visual-only for now and resets when the user stops it.
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="● BENCHMARK SUITE"
        title="Performance Dashboard"
        subtitle="Real-time inference throughput, TTFT latency, and hardware efficiency on your device."
        actions={
          <div className={styles.actions}>
            <Button
              appearance="secondary"
              icon={<ArrowLeftRegular />}
              onClick={() => navigate("/prompt-benchmark/playground")}
            >
              Back to Prompt Benchmark
            </Button>
            <Button
              appearance="primary"
              icon={status === "running" ? <StopRegular /> : <PlayRegular />}
              onClick={handleRunStop}
            >
              {status === "running" ? "Stop" : "Run Benchmark"}
            </Button>
            <Button appearance="secondary" icon={<ArrowDownloadRegular />} disabled>
              Export
            </Button>
          </div>
        }
      />

      <div className={styles.kpiGrid}>
        <MetricCard
          label="TTFT Latency"
          value={avgTtft != null ? avgTtft.toFixed(0) : "—"}
          unit="ms"
          sub="Time-to-first-token (chat avg)"
        />
        <MetricCard
          label="Generation Speed"
          value={avgTps != null ? avgTps.toFixed(1) : "—"}
          unit="tok/s"
          sub="Sustained (chat avg)"
        />
        <MetricCard
          label="Memory Bandwidth"
          badge={<StatusBadge tone="purple">N/A</StatusBadge>}
          value="—"
          unit="GB/s"
          sub="Requires hardware telemetry"
        />
        <MetricCard
          label="SoC Thermals"
          badge={<StatusBadge tone="purple">N/A</StatusBadge>}
          value="—"
          unit="°C"
          sub="Requires hardware telemetry"
        />
      </div>

      <div className={styles.split}>
        <SurfaceCard
          title="Real-Time Inference Throughput"
          action={
            <div className={styles.legend}>
              <span className={styles.legendNpu}>● NPU</span>
              <span className={styles.legendGpu}>● GPU</span>
              <span className={styles.legendCpu}>● CPU</span>
            </div>
          }
        >
          <ThroughputChart samples={samples} />
          {status !== "running" && samples.length === 0 && (
            <StateBlock message="Throughput sampling starts when a benchmark run is active. Live per-device telemetry requires backend support." />
          )}
        </SurfaceCard>

        <SurfaceCard title="Model Ranking" action={<Text size={200}>from chat stats</Text>}>
          {ranking.length === 0 ? (
            <StateBlock message="No benchmarks recorded yet." />
          ) : (
            <div className={styles.list}>
              {ranking.map((r, i) => (
                <div key={r.model} className={styles.row}>
                  <Text weight="semibold">0{i + 1}</Text>
                  <div className={styles.rowBody}>
                    <Text weight="semibold">{r.model}</Text>
                    <ProgressBar
                      value={(r.tokensPerSec / ranking[0].tokensPerSec) * 100}
                      color="cyan"
                    />
                  </div>
                  <Text>{r.tokensPerSec.toFixed(1)} tok/s</Text>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard
        title="Recent Runs"
        action={
          kpis.ttftMs != null ? <Text size={200}>TTFT {kpis.ttftMs.toFixed(0)}ms</Text> : undefined
        }
      >
        {runs.length === 0 ? (
          <StateBlock
            icon="🧪"
            message="No completed runs yet. Use the Prompt Benchmark to measure a specific prompt."
          >
            <Button appearance="primary" onClick={() => navigate("/prompt-benchmark/playground")}>
              Open Prompt Benchmark
            </Button>
          </StateBlock>
        ) : (
          <div className={styles.list}>
            {runs.map((run) => (
              <div key={run.id} className={styles.row}>
                <Text weight="semibold">{run.id.slice(0, 6)}</Text>
                <div className={styles.rowBody}>
                  <Text>
                    {run.target.toUpperCase()} · {new Date(run.startedAt).toLocaleTimeString()}
                  </Text>
                  <Text size={200}>
                    {run.totalTokens} tokens · {run.promptChars} chars prompt
                  </Text>
                </div>
                <Text>
                  {run.tokensPerSec != null ? `${run.tokensPerSec.toFixed(1)} tok/s` : "—"}
                  {run.ttftMs != null && ` · ${run.ttftMs.toFixed(0)}ms`}
                </Text>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
