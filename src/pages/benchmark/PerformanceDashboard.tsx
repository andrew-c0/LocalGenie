import { Button } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  PlayRegular,
  StopRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import ThroughputChart from "../../components/benchmark/ThroughputChart";
import { MetricCard, StateBlock, StatusBadge, SurfaceCard } from "../../components/ui/primitives";
import { useBenchmarkStore } from "../../stores/benchmarkStore";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";

/**
 * Benchmark & performance dashboard. Live KPIs are derived from real chat
 * generation stats; hardware-level metrics (bandwidth, thermals) are shown as
 * unavailable until backend telemetry exists.
 *
 * Rendered as a nested route of the Benchmark Suite (`PromptBenchmarkPage`).
 */
export default function PerformanceDashboard() {
  const navigate = useNavigate();
  const serverStatus = useModelStore((s) => s.serverStatus);
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
    <>
      <div className="lx-page-headrow">
        <div>
          <span className="lx-page-eyebrow">
            ● {serverStatus.running ? "RUNTIME ACTIVE" : "RUNTIME OFFLINE"}
          </span>
          <h1 className="lx-page-title">Benchmark & Performance</h1>
          <p className="lx-page-subtitle">
            Real-time inference throughput, TTFT latency, and hardware efficiency on your device.
          </p>
        </div>
        <div className="lx-page-actions">
          <Button
            appearance="subtle"
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
          <Button appearance="subtle" icon={<ArrowDownloadRegular />} disabled>
            Export
          </Button>
        </div>
      </div>

      {/* ── KPI grid ─────────────────────────────── */}
      <div className="lx-kpi-grid">
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

      {/* ── Chart + ranking ──────────────────────── */}
      <div className="lx-bench-split">
        <SurfaceCard
          title="Real-Time Inference Throughput"
          action={
            <div style={{ display: "flex", gap: 8, fontSize: 10.5 }}>
              <span style={{ color: "#4bd9e5" }}>● NPU</span>
              <span style={{ color: "#d8baff" }}>● GPU</span>
              <span style={{ color: "#8a919e" }}>● CPU</span>
            </div>
          }
        >
          <ThroughputChart samples={samples} />
          {status !== "running" && samples.length === 0 && (
            <StateBlock message="Throughput sampling starts when a benchmark run is active. Live per-device telemetry requires backend support." />
          )}
        </SurfaceCard>

        <SurfaceCard
          title="Model Ranking"
          action={
            <span className="lx-mono" style={{ fontSize: 10.5, color: "var(--lx-text-muted)" }}>
              from chat stats
            </span>
          }
        >
          {ranking.length === 0 ? (
            <StateBlock message="No benchmarks recorded yet." />
          ) : (
            <div>
              {ranking.map((r, i) => (
                <div key={r.model} className="lx-ranking-row">
                  <span className="lx-rank-num">0{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.model}</div>
                    <div className="lx-progress" style={{ marginTop: 4 }}>
                      <div
                        className="lx-progress-fill"
                        style={{ width: `${(r.tokensPerSec / ranking[0].tokensPerSec) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="lx-speed-tps">{r.tokensPerSec.toFixed(1)} tok/s</span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* ── Recent runs ──────────────────────────── */}
      <SurfaceCard
        title="Recent Runs"
        action={
          kpis.ttftMs != null ? (
            <span className="lx-mono" style={{ fontSize: 11 }}>
              TTFT {kpis.ttftMs.toFixed(0)}ms
            </span>
          ) : undefined
        }
      >
        {runs.length === 0 ? (
          <StateBlock
            icon="🧪"
            message="No completed runs yet. Use the Prompt Benchmark to measure a specific prompt."
          >
            <Button
              appearance="primary"
              size="small"
              onClick={() => navigate("/prompt-benchmark/playground")}
            >
              Open Prompt Benchmark
            </Button>
          </StateBlock>
        ) : (
          <div>
            {runs.map((run) => (
              <div key={run.id} className="lx-ranking-row">
                <span className="lx-rank-num">{run.id.slice(0, 6)}</span>
                <div style={{ fontSize: 12.5 }}>
                  <div>
                    {run.target.toUpperCase()} · {new Date(run.startedAt).toLocaleTimeString()}
                  </div>
                  <div className="lx-mono" style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
                    {run.totalTokens} tokens · {run.promptChars} chars prompt
                  </div>
                </div>
                <span className="lx-speed-tps">
                  {run.tokensPerSec != null ? `${run.tokensPerSec.toFixed(1)} tok/s` : "—"}
                  {run.ttftMs != null && ` · ${run.ttftMs.toFixed(0)}ms`}
                </span>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </>
  );
}
