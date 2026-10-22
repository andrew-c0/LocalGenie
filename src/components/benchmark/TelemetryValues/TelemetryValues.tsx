import { Caption1, Text } from "@fluentui/react-components";
import { useBenchmarkStore } from "../../../stores/benchmarkStore";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import "./TelemetryValues.css";

interface TelemetryCell {
  label: string;
  value: string;
  unit: string;
  /** Hardware metric with no backend telemetry yet. */
  unavailable?: boolean;
}

/** Live KPI tiles read from the benchmark store. Hardware metrics show N/A until telemetry exists. */
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
    { label: "Memory Bandwidth", value: "—", unit: "GB/s", unavailable: true },
    { label: "SoC Thermals", value: "—", unit: "°C", unavailable: true },
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
            {c.unavailable && <StatusBadge tone="purple">N/A</StatusBadge>}
          </div>
        </div>
      ))}
    </div>
  );
}
