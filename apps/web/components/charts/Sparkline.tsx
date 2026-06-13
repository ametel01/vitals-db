export interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  values,
  color = "#D8FF3D",
  width = 140,
  height = 44,
}: SparklineProps): React.ReactElement {
  if (values.length === 0) {
    return <div className="sparkline-empty">No data</div>;
  }
  const points = buildSparklinePoints(values, width, height);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className="sleep-metric-sparkline"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Metric trend sparkline"
      preserveAspectRatio="none"
    >
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function buildSparklinePoints(
  values: number[],
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xStep = values.length === 1 ? 0 : width / (values.length - 1);
  return values.map((value, index) => ({
    x: Number((index * xStep).toFixed(2)),
    y: Number((height - ((value - min) / span) * (height - 8) - 4).toFixed(2)),
  }));
}
