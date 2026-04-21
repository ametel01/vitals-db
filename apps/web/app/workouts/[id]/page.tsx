import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart } from "@/components/charts/LineChart";
import { getWorkoutDetail, getWorkoutHR } from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatIsoDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { DriftClassification, HRPoint, WorkoutDetail } from "@vitals/core";
import { HR_ZONES } from "@vitals/core";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface WorkoutDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkoutDetailPage({
  params,
}: WorkoutDetailPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  const [detailResult, hrResult] = await Promise.all([getWorkoutDetail(id), getWorkoutHR(id)]);

  if (!detailResult.ok && detailResult.status === 404) {
    notFound();
  }

  if (!detailResult.ok) {
    return (
      <div>
        <h2 className="page-title">Workout</h2>
        <ErrorBanner title="Could not load workout" detail={detailResult.message} />
      </div>
    );
  }

  const detail = detailResult.data;

  return (
    <div>
      <h2 className="page-title">{detail.type === "" ? "Workout" : detail.type}</h2>
      <p className="page-subtitle">
        {formatIsoDateTime(detail.start_ts)} — {formatIsoDateTime(detail.end_ts)}
      </p>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard label="Duration" value={formatDuration(detail.duration_sec)} />
        <StatCard
          label="Z2 ratio"
          value={detail.z2_ratio === null ? "—" : formatPercent(detail.z2_ratio, 1)}
          sub={`${HR_ZONES.Z2.min}–${HR_ZONES.Z2.max} bpm`}
        />
        <DriftCard detail={detail} />
        <StatCard
          label="Load"
          value={detail.load === null ? "—" : formatNumber(detail.load, 0)}
          sub="duration × avg HR"
        />
      </div>

      <div className="card">
        <h2>Heart rate</h2>
        {hrResult.ok ? (
          <HRChart points={hrResult.data} />
        ) : (
          <ErrorBanner title="Could not load HR series" detail={hrResult.message} />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): React.ReactElement {
  return (
    <div className="card">
      <h2>{label}</h2>
      <div className="stat-value">{value}</div>
      {sub === undefined ? null : <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function DriftCard({ detail }: { detail: WorkoutDetail }): React.ReactElement {
  const value = detail.drift_pct === null ? "—" : formatPercent(detail.drift_pct / 100, 1);
  const tagClass = driftTagClass(detail.drift_classification);
  return (
    <div className="card">
      <h2>HR drift</h2>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">
        <span className={`tag ${tagClass}`}>{detail.drift_classification}</span>
      </div>
    </div>
  );
}

function driftTagClass(classification: DriftClassification): string {
  switch (classification) {
    case "stable":
      return "success";
    case "moderate":
      return "warning";
    case "high":
      return "danger";
    default:
      return "";
  }
}

function HRChart({ points }: { points: HRPoint[] }): React.ReactElement {
  if (points.length === 0) {
    return <div className="empty-state">No heart-rate samples captured for this workout.</div>;
  }

  const series = [
    {
      name: "HR",
      color: "#f87171",
      data: points.map((p) => [p.ts, p.bpm] as [string, number]),
    },
  ];

  return (
    <LineChart
      key={chartDataKey("workout-hr", series)}
      series={series}
      yAxisLabel="bpm"
      height={320}
      markBand={{ yFrom: HR_ZONES.Z2.min, yTo: HR_ZONES.Z2.max, label: "Z2" }}
    />
  );
}
