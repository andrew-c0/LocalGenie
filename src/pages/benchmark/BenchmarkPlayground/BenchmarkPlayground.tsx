import {
  Button,
  Field,
  Radio,
  RadioGroup,
  Slider,
  Spinner,
  Textarea,
} from "@fluentui/react-components";
import { DeleteRegular, PlayRegular, SaveRegular, StopRegular } from "@fluentui/react-icons";
import { useCallback, useState } from "react";
import { TelemetryValues } from "../../../components/benchmark/TelemetryValues/TelemetryValues";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { useBenchmarkStore } from "../../../stores/benchmarkStore";
import { defaultSettings, useModelStore } from "../../../stores/modelStore";
import type { ComputeTarget, GenerationSettings } from "../../../types";
import "./BenchmarkPlayground.css";
import { Body, BodyStrong, Meta } from "../../../components/ui/Typography/Typography";

const COMPUTE_OPTIONS: [ComputeTarget, string][] = [
  ["npu", "Hexagon NPU"],
  ["gpu", "Adreno GPU"],
  ["cpu", "CPU"],
];

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

  return (
    <div className="benchmark-playground__page">
      <PageHeader
        eyebrow="● BENCHMARK SUITE"
        title="Prompt Benchmark"
        subtitle="Profile exact TTFT and sustained throughput for a fixed prompt on local acceleration hardware."
        actions={
          <div className="benchmark-playground__actions">
            <Button
              appearance="secondary"
              icon={<SaveRegular />}
              disabled
              title="Presets are not available yet"
            >
              Save Preset
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
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="benchmark-playground__split">
        <div className="benchmark-playground__column">
          <SurfaceCard
            title="Prompt Editor"
            action={
              <div className="benchmark-playground__prompt-actions">
                <Meta className="benchmark-playground__mono-hint">≈{approxTokens} tokens</Meta>
                <Button
                  appearance="secondary"
                  icon={<DeleteRegular />}
                  title="Clear prompt"
                  aria-label="Clear prompt"
                  onClick={() => {
                    setPrompt("");
                    setGeneratedTokens(0);
                    useBenchmarkStore.getState().reset();
                  }}
                />
              </div>
            }
          >
            <Textarea
              className="benchmark-playground__prompt"
              resize="vertical"
              placeholder="Instruction prompt to benchmark…"
              value={prompt}
              onChange={(_, data) => setPrompt(data.value)}
              onKeyDown={handleKeyDown}
              aria-label="Benchmark prompt"
            />
          </SurfaceCard>

          <SurfaceCard title="Inference Parameters">
            <div className="benchmark-playground__params">
              <Field label={`Temperature · ${temperature.toFixed(2)}`}>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(_, d) => setTemperature(d.value)}
                  aria-label="Temperature"
                />
              </Field>
              <Field label={`Top-P · ${topP.toFixed(2)}`}>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={topP}
                  onChange={(_, d) => setTopP(d.value)}
                  aria-label="Top-P"
                />
              </Field>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Compute Target">
            <RadioGroup
              layout="horizontal"
              aria-label="Compute target"
              value={target}
              onChange={(_, data) => {
                const next = COMPUTE_OPTIONS.find(([id]) => id === data.value);
                if (next) setTarget(next[0]);
              }}
            >
              {COMPUTE_OPTIONS.map(([id, label]) => (
                <Radio key={id} value={id} label={label} />
              ))}
            </RadioGroup>
            <Meta>
              Target selection is recorded with the run. Actual execution device is chosen by the
              GenieX runtime.
            </Meta>
          </SurfaceCard>
        </div>

        <div className="benchmark-playground__column">
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
              <Meta className="benchmark-playground__mono-hint">
                {generatedTokens} tokens generated
              </Meta>
            }
          >
            {output ? (
              <pre className="benchmark-playground__output">{output}</pre>
            ) : (
              <StateBlock message="Run the benchmark to see generated output." />
            )}
          </SurfaceCard>

          <SurfaceCard title="Recent Runs">
            {runs.length === 0 ? (
              <StateBlock message="No runs recorded yet." />
            ) : (
              <div className="benchmark-playground__runs">
                {runs.map((run, i) => (
                  <div key={run.id} className="benchmark-playground__run-row">
                    <BodyStrong>#{runs.length - i}</BodyStrong>
                    <div className="benchmark-playground__run-meta">
                      <Body>{run.target.toUpperCase()}</Body>
                      <Meta className="benchmark-playground__mono-hint">
                        {new Date(run.startedAt).toLocaleTimeString()} · {run.totalTokens} tokens
                      </Meta>
                    </div>
                    <Body>
                      {run.ttftMs != null && `${run.ttftMs.toFixed(0)}ms · `}
                      {run.tokensPerSec != null ? `${run.tokensPerSec.toFixed(1)} tok/s` : "—"}
                    </Body>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
