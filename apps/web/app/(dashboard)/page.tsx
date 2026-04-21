import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import {
  deriveWeeklyActivity,
  getActivity,
  getHRV,
  getPower,
  getRestingHR,
  getSleepSummary,
  getSpeed,
  getSteps,
  getVO2Max,
  getWalkingHR,
  listWorkouts,
} from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatNumber,
  formatPercent,
  formatSleepConsistencyMinutes,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type { ActivityPoint } from "@vitals/core";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const to = todayIso();
  const from = windowStartIso(30);
  const activityFrom = windowStartIso(12 * 7);

  const [restingHR, sleep, vo2max, hrv, steps, walkingHR, speed, power, activity] =
    await Promise.all([
      getRestingHR({ from, to }),
      getSleepSummary({ from, to }),
      getVO2Max({ from, to }),
      getHRV({ from, to }),
      getSteps({ from, to }),
      getWalkingHR({ from, to }),
      getSpeed({ from, to }),
      getPower({ from, to }),
      getActivity({ from: activityFrom, to }),
    ]);
  const workouts = activity.ok ? null : await listWorkouts({ from: activityFrom, to });

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-subtitle">
        Last 30 days — {from} to {to}
      </p>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <RestingHRCard result={restingHR} />
        <SleepCard result={sleep} />
        <VO2MaxCard result={vo2max} />
        <HRVCard result={hrv} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <StepsCard result={steps} />
        <WalkingHRCard result={walkingHR} />
      </div>

      <h3 className="section-title">Performance</h3>
      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <SpeedCard result={speed} />
        <PowerCard result={power} />
      </div>

      <div className="card">
        <h2>Weekly workout activity (last 12 weeks)</h2>
        <WorkoutActivityChart activity={activity} workouts={workouts} />
      </div>
    </div>
  );
}

function RestingHRCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getRestingHR>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Resting heart rate</h2>
        <ErrorBanner title="Could not load resting HR" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>Resting heart rate</h2>
        <div className="empty-state">No resting HR samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_rhr, 0) / points.length;
  const series = [
    {
      name: "Resting HR",
      color: "#60a5fa",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_rhr] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>Resting heart rate</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_rhr, 0)} bpm`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 1)} bpm</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("resting-hr", series)}
          series={series}
          yAxisLabel="bpm"
          height={220}
        />
      </div>
    </div>
  );
}

function SleepCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSleepSummary>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Sleep</h2>
        <ErrorBanner title="Could not load sleep summary" detail={result.message} />
      </div>
    );
  }

  const summary = result.data;
  const hours = summary.total_hours;
  const efficiency = summary.efficiency;
  const consistency = summary.consistency_stddev;

  return (
    <div className="card">
      <h2>Sleep (30-day total)</h2>
      <div className="stat-value">{formatNumber(hours, 1)} h</div>
      <div className="stat-sub">
        Efficiency {efficiency === null ? "—" : formatPercent(efficiency, 0)} · Consistency σ{" "}
        {consistency === null ? "—" : formatSleepConsistencyMinutes(consistency)}
      </div>
      <div style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 13 }}>
        Summary across the 30-day window. Efficiency is asleep hours over in-bed hours; consistency
        σ is the standard deviation of bedtime, in minutes.
      </div>
    </div>
  );
}

function VO2MaxCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getVO2Max>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>VO2 max</h2>
        <ErrorBanner title="Could not load VO2 max" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>VO2 max</h2>
        <div className="empty-state">No VO2 max samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_vo2max, 0) / points.length;
  const series = [
    {
      name: "VO2 max",
      color: "#34d399",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_vo2max] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>VO2 max</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_vo2max, 1)} ml/kg/min`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 1)} ml/kg/min</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("vo2max", series)}
          series={series}
          yAxisLabel="ml/kg/min"
          height={220}
        />
      </div>
    </div>
  );
}

function HRVCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getHRV>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>HRV</h2>
        <ErrorBanner title="Could not load HRV" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>HRV</h2>
        <div className="empty-state">No HRV samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_hrv, 0) / points.length;
  const series = [
    {
      name: "HRV",
      color: "#f472b6",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_hrv] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>HRV</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_hrv, 0)} ms`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 1)} ms</div>
      <div style={{ marginTop: 16 }}>
        <LineChart key={chartDataKey("hrv", series)} series={series} yAxisLabel="ms" height={220} />
      </div>
    </div>
  );
}

function StepsCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSteps>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Steps</h2>
        <ErrorBanner title="Could not load steps" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>Steps</h2>
        <div className="empty-state">No step samples in range.</div>
      </div>
    );
  }

  const total = points.reduce((sum, p) => sum + p.total_steps, 0);
  const avg = total / points.length;
  const last = points[points.length - 1];
  const series = [
    {
      name: "Steps",
      color: "#f59e0b",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.total_steps] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>Steps</h2>
      <div className="stat-value">
        {last === undefined ? "—" : formatNumber(last.total_steps, 0)}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 0)} / day</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("steps", series)}
          series={series}
          yAxisLabel="steps"
          height={220}
        />
      </div>
    </div>
  );
}

function WalkingHRCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getWalkingHR>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Walking heart rate</h2>
        <ErrorBanner title="Could not load walking HR" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>Walking heart rate</h2>
        <div className="empty-state">No walking HR samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_walking_hr, 0) / points.length;
  const series = [
    {
      name: "Walking HR",
      color: "#a78bfa",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_walking_hr] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>Walking heart rate</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_walking_hr, 0)} bpm`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 1)} bpm</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("walking-hr", series)}
          series={series}
          yAxisLabel="bpm"
          height={220}
        />
      </div>
    </div>
  );
}

function SpeedCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSpeed>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Running speed</h2>
        <ErrorBanner title="Could not load speed" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>Running speed</h2>
        <div className="empty-state">No running speed samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_speed, 0) / points.length;
  const series = [
    {
      name: "Speed",
      color: "#22d3ee",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_speed] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>Running speed</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_speed, 2)} m/s`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 2)} m/s</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("speed", series)}
          series={series}
          yAxisLabel="m/s"
          height={220}
        />
      </div>
    </div>
  );
}

function PowerCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getPower>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <h2>Running power</h2>
        <ErrorBanner title="Could not load power" detail={result.message} />
      </div>
    );
  }

  const points = result.data;
  if (points.length === 0) {
    return (
      <div className="card">
        <h2>Running power</h2>
        <div className="empty-state">No running power samples in range.</div>
      </div>
    );
  }

  const last = points[points.length - 1];
  const avg = points.reduce((sum, p) => sum + p.avg_power, 0) / points.length;
  const series = [
    {
      name: "Power",
      color: "#fb7185",
      data: points.map((p) => [`${p.day}T00:00:00Z`, p.avg_power] as [string, number]),
    },
  ];

  return (
    <div className="card">
      <h2>Running power</h2>
      <div className="stat-value">
        {last === undefined ? "—" : `${formatNumber(last.avg_power, 0)} W`}
      </div>
      <div className="stat-sub">30-day avg {formatNumber(avg, 0)} W</div>
      <div style={{ marginTop: 16 }}>
        <LineChart
          key={chartDataKey("power", series)}
          series={series}
          yAxisLabel="watts"
          height={220}
        />
      </div>
    </div>
  );
}

function WorkoutActivityChart({
  activity,
  workouts,
}: {
  activity: Awaited<ReturnType<typeof getActivity>>;
  workouts: Awaited<ReturnType<typeof listWorkouts>> | null;
}): React.ReactElement {
  // Prefer the server-backed /metrics/activity endpoint; fall back to the
  // client-side deriver if the server call fails but the workouts list loaded.
  let weekly: ActivityPoint[];
  if (activity.ok) {
    weekly = activity.data;
  } else if (workouts?.ok) {
    weekly = deriveWeeklyActivity(workouts.data);
  } else {
    return <ErrorBanner title="Could not load activity" detail={activity.message} />;
  }

  if (weekly.length === 0) {
    return <div className="empty-state">No workouts in the last 12 weeks.</div>;
  }

  const categories = weekly.map((w) => w.week);
  const series = [
    {
      name: "Duration",
      color: "#60a5fa",
      data: weekly.map((w) => Math.round(w.total_duration_sec / 60)),
    },
  ];

  const totalCount = weekly.reduce((s, w) => s + w.workout_count, 0);
  const totalDuration = weekly.reduce((s, w) => s + w.total_duration_sec, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 8,
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        <span>{totalCount} workouts</span>
        <span>{formatDuration(totalDuration)} total</span>
      </div>
      <StackedBar
        key={chartDataKey("weekly-activity", { categories, series })}
        categories={categories}
        series={series}
        yAxisLabel="minutes"
      />
    </div>
  );
}
