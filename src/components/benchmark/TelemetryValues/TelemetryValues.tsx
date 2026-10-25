import { Caption1, Text } from "@fluentui/react-components";
import { useBenchmarkStore } from "../../../stores/benchmarkStore";
import "./TelemetryValues.css";

interface TelemetryCell {
  label: string;
  value: string;
  unit: string;
}

/** Live KPI tiles read from the benchmark store. A dash means no run has reported that value yet. */
export function TelemetryValues() {
  const kpis = useBenchmarkStore((s) => s.kpis);

  const cells: TelemetryCell[] = [
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
  ];

  return (
    <div className="telemetry-values__grid">
      {cells.map((c) => (
        <div key={c.label} className="telemetry-values__cell">
          <Caption1>{c.label}</Caption1>
          <div className="telemetry-values__value">
            <Text size={600} weight="semibold">
              {c.value}
            </Text>
            <Caption1>{c.unit}</Caption1>
          </div>
        </div>
      ))}
    </div>
  );
}
