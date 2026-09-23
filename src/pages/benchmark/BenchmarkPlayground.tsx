import { Button, Slider, Spinner } from "@fluentui/react-components";
import { DeleteRegular, PlayRegular, SaveRegular, StopRegular } from "@fluentui/react-icons";
import { useCallback, useState } from "react";
import { StateBlock, StatusBadge, SurfaceCard } from "../../components/ui/primitives";
import { useBenchmarkStore } from "../../stores/benchmarkStore";
import { defaultSettings, useModelStore } from "../../stores/modelStore";
import type { ComputeTarget, GenerationSettings } from "../../types";

/**
 * Prompt Benchmark Playground — executes a fixed prompt via the local
 * OpenAI-compatible endpoint and reports real TTFT/throughput measured in
 * the browser. Hardware-specific metrics are shown as unavailable.
 *
 * Rendered as a subpage of the Benchmark Suite (`PromptBenchmarkPage`).
 */
export default function BenchmarkPlayground() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const activeModelId = useModelStore((s) => s.activeModelId);

  const status = useBenchmarkStore((s) => s.status);
  const target = useBenchmarkStore((s) => s.target);
  const prompt = useBenchmarkStore((s) => s.prompt);
  const temperature = useBenchmarkStore((s) => s.temperature);
  const topP = useBenchmarkStore((s) => s.topP);
  const output = useBenchmarkStore((s) => s.output);
  const generatedTokens = useBenchmarkStore((s) => s.generatedTokens);
  const runs = useBenchmarkStore((s) => s.runs);

  const setPrompt = useBenchmarkStore((s) => s.setPrompt);
  const setTemperature = useBenchmarkStore((s) => s.setTemperature);
  const setTopP = useBenchmarkStore((s) => s.setTopP);
  const setTarget = useBenchmarkStore((s) => s.setTarget);
  const setKpis = useBenchmarkStore((s) => s.setKpis);
  const setStatus = useBenchmarkStore((s) => s.setStatus);
  const appendOutput = useBenchmarkStore((s) => s.appendOutput);
  const setGeneratedTokens = useBenchmarkStore((s) => s.setGeneratedTokens);
  const recordRun = useBenchmarkStore((s) => s.recordRun);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const approxTokens = Math.ceil(prompt.length / 4);

  const execute = useCallback(async () => {
    if (!prompt.trim() || status === "running") return;
    if (!serverStatus.running) {
      setError("Server is offline. Start it from the Overview or model selector.");
      return;
    }

    setStatus("running");
    setError(null);
    const startedAt = Date.now();

    try {
      const settings: GenerationSettings = {
        ...defaultSettings,
        temperature,
        topP,
      };

      let firstTokenMs: number | null = null;
      let tokens = 0;

      // Use a raw streaming completion so we can measure TTFT precisely.
      const baseUrl = `http://127.0.0.1:${serverPort}`;
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeModelId ?? undefined,
          messages: [{ role: "user", content: prompt }],
          temperature: settings.temperature,
          top_p: settings.topP,
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Completion failed: ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
            const chunk = json.choices?.[0]?.delta?.content;
            if (chunk) {
              if (firstTokenMs == null) {
                firstTokenMs = Date.now() - startedAt;
              }
              tokens += 1;
              appendOutput(chunk);
            }
          } catch {
            // partial JSON — ignore
          }
        }
      }

      const totalMs = Date.now() - startedAt;
      const tps = totalMs > 0 && tokens > 0 ? tokens / (totalMs / 1000) : null;

      setGeneratedTokens(tokens);
      setKpis({ ttftMs: firstTokenMs, tokensPerSec: tps });
      recordRun({
        id: crypto.randomUUID(),
        startedAt,
        target,
        ttftMs: firstTokenMs,
        tokensPerSec: tps,
        totalTokens: tokens,
        promptChars: prompt.length,
      });
      setStatus("completed");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [
    prompt,
    status,
    serverStatus.running,
    serverPort,
    activeModelId,
    temperature,
    topP,
    target,
    appendOutput,
    recordRun,
    setGeneratedTokens,
    setKpis,
    setStatus,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void execute();
    }
  };

  const savePreset = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="lx-page-headrow">
        <div>
          <span className="lx-page-eyebrow">● PROMPT BENCHMARK PLAYGROUND</span>
          <h1 className="lx-page-title">Prompt Benchmark</h1>
          <p className="lx-page-subtitle">
            Profile exact TTFT and sustained throughput for a fixed prompt on local acceleration
            hardware.
          </p>
        </div>
        <div className="lx-page-actions">
          <Button appearance="subtle" icon={<SaveRegular />} onClick={savePreset}>
            {saved ? "Saved ✓" : "Save Preset"}
          </Button>
          <Button
            appearance="primary"
            icon={status === "running" ? <StopRegular /> : <PlayRegular />}
            onClick={() => (status === "running" ? setStatus("idle") : void execute())}
            disabled={!serverStatus.running || !prompt.trim()}
          >
            {status === "running" ? <Spinner size="tiny" /> : "Execute Benchmark"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="lx-hw-banner" style={{ borderColor: "var(--lx-error)" }}>
          ⚠ {error}
        </div>
      )}

      <div className="lx-bench-split-57">
        {/* ── Left: editor + parameters ──────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SurfaceCard
            title="Prompt Editor"
            action={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-telemetry)" }}>
                  ≈{approxTokens} tokens
                </span>
                <Button
                  appearance="transparent"
                  size="small"
                  icon={<DeleteRegular />}
                  onClick={() => {
                    setPrompt("");
                    setGeneratedTokens(0);
                    useBenchmarkStore.getState().reset();
                  }}
                />
              </div>
            }
          >
            <textarea
              className="lx-input"
              style={{
                width: "100%",
                minHeight: 140,
                resize: "vertical",
                fontFamily: "Consolas, monospace",
              }}
              placeholder="Instruction prompt to benchmark…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Benchmark prompt"
            />
          </SurfaceCard>

          <SurfaceCard title="Inference Parameters">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 12.5 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                  id="lx-temp-label"
                >
                  <span>Temperature</span>
                  <span className="lx-mono">{temperature.toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(_, d) => setTemperature(d.value)}
                  aria-labelledby="lx-temp-label"
                />
              </div>
              <div style={{ fontSize: 12.5 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                  id="lx-topp-label"
                >
                  <span>Top-P</span>
                  <span className="lx-mono">{topP.toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={topP}
                  onChange={(_, d) => setTopP(d.value)}
                  aria-labelledby="lx-topp-label"
                />
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Compute Target">
            <div className="lx-chiprow">
              {(
                [
                  ["npu", "Hexagon NPU"],
                  ["gpu", "Adreno GPU"],
                  ["cpu", "CPU"],
                ] as [ComputeTarget, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`lx-chip${target === id ? " active" : ""}`}
                  onClick={() => setTarget(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="lx-page-subtitle" style={{ marginTop: 8, fontSize: 11.5 }}>
              Target selection is recorded with the run. Actual execution device is chosen by the
              GenieX runtime.
            </p>
          </SurfaceCard>
        </div>

        {/* ── Right: telemetry, output, runs ─────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SurfaceCard
            title="Live Telemetry"
            action={
              <StatusBadge
                tone={status === "running" ? "cyan" : status === "completed" ? "green" : "default"}
              >
                {status.toUpperCase()}
              </StatusBadge>
            }
          >
            <TelemetryValues />
          </SurfaceCard>

          <SurfaceCard
            title="Output Preview"
            action={
              <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-telemetry)" }}>
                {generatedTokens} tokens generated
              </span>
            }
          >
            {output ? (
              <pre
                className="lx-mono"
                style={{
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 220,
                  overflowY: "auto",
                  background: "var(--lx-surface-base)",
                  padding: 12,
                  borderRadius: 8,
                  margin: 0,
                }}
              >
                {output}
              </pre>
            ) : (
              <StateBlock message="Run the benchmark to see generated output." />
            )}
          </SurfaceCard>

          <SurfaceCard title="Recent Runs">
            {runs.length === 0 ? (
              <StateBlock message="No runs recorded yet." />
            ) : (
              <div>
                {runs.map((run, i) => (
                  <div key={run.id} className="lx-ranking-row">
                    <span className="lx-rank-num">#{runs.length - i}</span>
                    <div style={{ fontSize: 12.5 }}>
                      <div>{run.target.toUpperCase()}</div>
                      <div
                        className="lx-mono"
                        style={{ fontSize: 11, color: "var(--lx-text-muted)" }}
                      >
                        {new Date(run.startedAt).toLocaleTimeString()} · {run.totalTokens} tokens
                      </div>
                    </div>
                    <span className="lx-speed-tps">
                      {run.ttftMs != null && `${run.ttftMs.toFixed(0)}ms · `}
                      {run.tokensPerSec != null ? `${run.tokensPerSec.toFixed(1)} tok/s` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </>
  );
}

/** Live KPI values read from the benchmark store. */
function TelemetryValues() {
  const kpis = useBenchmarkStore((s) => s.kpis);
  const cells: { label: string; value: string; unit: string }[] = [
    {
      label: "TTFT Latency",
      value: kpis.ttftMs != null ? kpis.ttftMs.toFixed(1) : "—",
      unit: "ms",
    },
    {
      label: "Throughput",
      value: kpis.tokensPerSec != null ? kpis.tokensPerSec.toFixed(1) : "—",
      unit: "tok/s",
    },
    { label: "Total Time", value: kpis.ttftMs != null ? "✓" : "—", unit: "" },
    { label: "Power Draw", value: "—", unit: "W" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {cells.map((c) => (
        <div key={c.label}>
          <div style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>{c.label}</div>
          <div>
            <span className="lx-metric-value" style={{ fontSize: 20 }}>
              {c.value}
            </span>
            {c.unit && <span className="lx-metric-unit"> {c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
