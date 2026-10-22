import { useMemo } from "react";
import type { BenchmarkSample } from "../../../types";
import "./ThroughputChart.css";

interface ThroughputChartProps {
  samples: BenchmarkSample[];
  /** Height of the drawing area in px. */
  height?: number;
}

type SeriesId = "npu" | "gpu" | "cpu";

/** Chart padding — module-level constant so it's a stable dependency. */
const PAD = { top: 12, right: 12, bottom: 24, left: 36 } as const;

/**
 * Dependency-free responsive SVG multi-series line chart with area fill
 * for the primary (NPU) series.
 */
export default function ThroughputChart({ samples, height = 224 }: ThroughputChartProps) {
  const W = 600;
  const H = height;

  const seriesClass: Record<SeriesId, string> = {
    npu: "throughput-chart__npu-stroke",
    gpu: "throughput-chart__gpu-stroke",
    cpu: "throughput-chart__cpu-stroke",
  };

  const { paths, areaPath, yTicks, xLabels } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    if (samples.length < 2) {
      return {
        paths: [] as { id: SeriesId; d: string }[],
        areaPath: "",
        yTicks: [0, 25, 50, 75, 100],
        xLabels: [] as { x: number; label: string }[],
      };
    }

    const values: number[] = [];
    for (const s of samples) {
      if (s.npu != null) values.push(s.npu);
      if (s.gpu != null) values.push(s.gpu);
      if (s.cpu != null) values.push(s.cpu);
    }
    const maxV = Math.max(1, ...values) * 1.15;
    const t0 = samples[0].t;
    const tN = samples[samples.length - 1].t;
    const span = Math.max(1, tN - t0);

    const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / maxV) * innerH;

    const line = (get: (s: BenchmarkSample) => number | undefined) => {
      let d = "";
      for (const s of samples) {
        const v = get(s);
        if (v == null) continue;
        d += `${d === "" ? "M" : "L"}${x(s.t).toFixed(1)},${y(v).toFixed(1)}`;
      }
      return d;
    };

    const npuD = line((s) => s.npu);
    const area =
      npuD && samples.length > 1
        ? `${npuD}L${x(samples[samples.length - 1].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)}L${x(samples[0].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)}Z`
        : "";

    const paths: { id: SeriesId; d: string }[] = [
      { id: "npu" as const, d: npuD },
      { id: "gpu" as const, d: line((s) => s.gpu) },
      { id: "cpu" as const, d: line((s) => s.cpu) },
    ].filter((p) => p.d !== "");

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));

    const xLabels = [
      { x: PAD.left, label: `${Math.round(span / 1000)}s ago` },
      { x: PAD.left + innerW / 2, label: `${Math.round(span / 2000)}s ago` },
      { x: PAD.left + innerW, label: "now" },
    ];

    return { paths, areaPath: area, yTicks, xLabels };
  }, [samples, H]);

  if (samples.length < 2) {
    return (
      <div className="throughput-chart__empty" style={{ height: H }}>
        Awaiting throughput samples…
      </div>
    );
  }

  return (
    <svg
      className="throughput-chart__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Inference throughput over time"
    >
      <defs>
        <linearGradient id="throughputNpuGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="throughput-chart__npu-stop" stopOpacity="0.5" />
          <stop offset="1" className="throughput-chart__npu-stop" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid + y labels */}
      {yTicks.map((v, i) => {
        const innerH = H - PAD.top - PAD.bottom;
        const yy = PAD.top + innerH - (i / (yTicks.length - 1)) * innerH;
        return (
          <g key={v}>
            <line
              className="throughput-chart__grid-line"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yy}
              y2={yy}
              strokeWidth="0.5"
            />
            <text
              className="throughput-chart__axis-text"
              x={PAD.left - 4}
              y={yy + 3}
              textAnchor="end"
              fontSize="9"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* x labels */}
      {xLabels.map((l) => (
        <text
          key={l.label}
          className="throughput-chart__axis-text"
          x={l.x}
          y={H - 6}
          textAnchor={l.x === PAD.left ? "start" : l.x === W - PAD.right ? "end" : "middle"}
          fontSize="9"
        >
          {l.label}
        </text>
      ))}

      {/* NPU area fill */}
      {areaPath && <path d={areaPath} fill="url(#throughputNpuGrad)" opacity="0.35" />}

      {/* series */}
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          fill="none"
          className={seriesClass[p.id]}
          strokeWidth={p.id === "cpu" ? 1.2 : 2}
          strokeDasharray={p.id === "cpu" ? "4 3" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* live point on NPU series */}
      {samples.length > 0 && samples[samples.length - 1].npu != null && (
        <circle
          className="throughput-chart__npu-fill"
          cx={W - PAD.right}
          cy={
            PAD.top +
            (H - PAD.top - PAD.bottom) -
            ((samples[samples.length - 1].npu ?? 0) / (Math.max(...yTicks) || 1)) *
              (H - PAD.top - PAD.bottom)
          }
          r="3"
        />
      )}
    </svg>
  );
}
