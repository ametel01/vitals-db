import { CardTitle } from "@/components/CardTitle";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart } from "@/components/charts/LineChart";
import {
  getRestingHRRolling,
  getWorkoutDetail,
  getWorkoutEfficiency,
  listWorkouts,
} from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatIsoDateTime,
  formatPace,
  formatPercent,
  formatPercentValue,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type { WorkoutSummary } from "@vitals/core";
import Link from "next/link";

export const dynamic = "force-dynamic";

const RHR_WINDOW_DAYS = 60;
const RUN_WINDOW_DAYS = 120;
const RUN_LIMIT = 8;

interface PerformanceRunRow {
  workout: WorkoutSummary;
  detail: Awaited<ReturnType<typeof getWorkoutDetail>>;
  efficiency: Awaited<ReturnType<typeof getWorkoutEfficiency>>;
}

export default async function PerformancePage(): Promise<React.ReactElement> {
  const to = todayIso();
  const rhrFrom = windowStartIso(RHR_WINDOW_DAYS);
  const runFrom = windowStartIso(RUN_WINDOW_DAYS);

  const [rollingResult, workoutsResult] = await Promise.all([
    getRestingHRRolling({ from: rhrFrom, to }),
    listWorkouts({ type: "Running", from: runFrom, to, limit: RUN_LIMIT }),
  ]);

  const runRows =
    workoutsResult.ok && workoutsResult.data.length > 0
      ? await Promise.all(
          workoutsResult.data.map(async (workout) => {
            const [detail, efficiency] = await Promise.all([
              getWorkoutDetail(workout.id),
              getWorkoutEfficiency(workout.id),
            ]);
            return { workout, detail, efficiency };
          }),
        )
      : [];

  return (
    <div>
      <div className="kicker">
        <span>Endurance</span>
        <span>·</span>
        <span>{RUN_WINDOW_DAYS}-day window</span>
      </div>
      <h2 className="page-title">
        Slow burn, <em>sharp read.</em>
      </h2>
      <p className="page-subtitle">
        Endurance KPIs with explicit contracts — rolling 7-day resting HR, fixed-HR pace, first
        45-60 minute decoupling, and sample-based Z2 share.
      </p>

      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <RollingRHRCard result={rollingResult} from={rhrFrom} to={to} />
        <div className="card">
          <CardTitle
            title="KPI notes"
            tip="Contract definitions for the endurance KPIs — what each number includes and excludes."
          />
          <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
            Fixed-HR pace uses only aligned workout speed + HR samples in the 120-130 bpm band.
            Decoupling uses the first 45-60 minutes only and returns null when a run is too short or
            when aligned samples are missing. Z2 share reuses the existing sample-based `z2_ratio`
            contract.
          </div>
        </div>
      </div>

      <div className="card">
        <CardTitle
          title="Recent runs"
          tip="Your most recent running sessions, each with pace @ 120-130 bpm, first-hour decoupling, and Z2 share."
        />
        {!workoutsResult.ok ? (
          <ErrorBanner title="Could not load running workouts" detail={workoutsResult.message} />
        ) : runRows.length === 0 ? (
          <div className="empty-state">No recent running workouts were found in this window.</div>
        ) : (
          <RecentRunsTable rows={runRows} />
        )}
      </div>
    </div>
  );
}

function RollingRHRCard({
  result,
  from,
  to,
}: {
  result: Awaited<ReturnType<typeof getRestingHRRolling>>;
  from: string;
  to: string;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <CardTitle
          title="Rolling resting HR"
          tip="A 7-day centered moving average of resting heart rate. Smooths daily noise so multi-week trends are easier to read."
        />
        <ErrorBanner title="Could not load rolling resting HR" detail={result.message} />
      </div>
    );
  }

  if (result.data.length === 0) {
    return (
      <div className="card">
        <CardTitle
          title="Rolling resting HR"
          tip="A 7-day centered moving average of resting heart rate. Smooths daily noise so multi-week trends are easier to read."
        />
        <div className="empty-state">
          No resting-HR rows were found between {from} and {to}.
        </div>
      </div>
    );
  }

  const latest = result.data[result.data.length - 1];
  const average =
    result.data.reduce((sum, point) => sum + point.avg_rhr_7d, 0) / result.data.length;
  const series = [
    {
      name: "7-day avg RHR",
      color: "#FF6B4A",
      data: result.data.map(
        (point) => [`${point.day}T00:00:00Z`, point.avg_rhr_7d] as [string, number],
      ),
    },
  ];

  return (
    <div className="card">
      <CardTitle
        title="Rolling resting HR"
        tip="A 7-day centered moving average of resting heart rate. Smooths daily noise so multi-week trends are easier to read."
      />
      <div className="stat-value">
        {latest === undefined ? "—" : `${latest.avg_rhr_7d.toFixed(1)} bpm`}
      </div>
      <div className="stat-sub">
        {RHR_WINDOW_DAYS}-day view · series avg {average.toFixed(1)} bpm
      </div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("rolling-rhr", series)}
          series={series}
          yAxisLabel="bpm"
          height={260}
        />
      </div>
    </div>
  );
}

function RecentRunsTable({ rows }: { rows: PerformanceRunRow[] }): React.ReactElement {
  return (
    <table className="workouts-table">
      <thead>
        <tr>
          <th>Start</th>
          <th>Duration</th>
          <th>Pace @ 120-130</th>
          <th>Decoupling</th>
          <th>Z2 share</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ workout, detail, efficiency }) => {
          const pace = efficiency.ok ? formatPace(efficiency.data.pace_at_hr.pace_sec_per_km) : "—";
          const decoupling =
            efficiency.ok && efficiency.data.decoupling.decoupling_pct !== null
              ? formatPercentValue(efficiency.data.decoupling.decoupling_pct, 1)
              : "—";
          const z2 =
            detail.ok && detail.data.z2_ratio !== null
              ? formatPercent(detail.data.z2_ratio, 1)
              : "—";

          return (
            <tr key={workout.id}>
              <td>{formatIsoDateTime(workout.start_ts)}</td>
              <td>{formatDuration(workout.duration_sec)}</td>
              <td>{pace}</td>
              <td>{decoupling}</td>
              <td>{z2}</td>
              <td>
                <Link href={`/workouts/${encodeURIComponent(workout.id)}`}>Detail →</Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
