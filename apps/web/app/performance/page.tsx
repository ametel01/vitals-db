import { CardTitle } from "@/components/CardTitle";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart, type LineSeries } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import {
  type FetchResult,
  getActivity,
  getDistance,
  getEnergy,
  getHRV,
  getLoad,
  getPower,
  getRestingHRRolling,
  getRunningDynamics,
  getSpeed,
  getVO2Max,
  getWorkoutDetail,
  getWorkoutEfficiency,
  getWorkoutEvents,
  getWorkoutMetadata,
  getWorkoutRoutes,
  getWorkoutStats,
  getZoneTimeDistribution,
  listWorkouts,
} from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatIsoDateTime,
  formatNumber,
  formatPace,
  formatPercent,
  formatPercentValue,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type { LoadRow, RestingHRRollingPoint, WorkoutStat, WorkoutSummary } from "@vitals/core";
import Link from "next/link";

export const dynamic = "force-dynamic";

const RHR_WINDOW_DAYS = 60;
const PERFORMANCE_WINDOW_DAYS = 120;
const ACTIVITY_WINDOW_DAYS = 180;
const SHORT_WINDOW_DAYS = 30;
const RUN_LIMIT = 14;

interface PerformanceRunRow {
  workout: WorkoutSummary;
  detail: Awaited<ReturnType<typeof getWorkoutDetail>>;
  efficiency: Awaited<ReturnType<typeof getWorkoutEfficiency>>;
  stats: Awaited<ReturnType<typeof getWorkoutStats>>;
  events: Awaited<ReturnType<typeof getWorkoutEvents>>;
  metadata: Awaited<ReturnType<typeof getWorkoutMetadata>>;
  routes: Awaited<ReturnType<typeof getWorkoutRoutes>>;
}

export default async function PerformancePage(): Promise<React.ReactElement> {
  const to = todayIso();
  const rhrFrom = windowStartIso(RHR_WINDOW_DAYS);
  const performanceFrom = windowStartIso(PERFORMANCE_WINDOW_DAYS);
  const activityFrom = windowStartIso(ACTIVITY_WINDOW_DAYS);
  const shortFrom = windowStartIso(SHORT_WINDOW_DAYS);

  const [
    rollingResult,
    vo2Result,
    hrvResult,
    speedResult,
    powerResult,
    dynamicsResult,
    loadResult,
    activityResult,
    distanceResult,
    energyResult,
    zoneTimeResult,
    workoutsResult,
  ] = await Promise.all([
    getRestingHRRolling({ from: rhrFrom, to }),
    getVO2Max({ from: performanceFrom, to }),
    getHRV({ from: performanceFrom, to }),
    getSpeed({ from: performanceFrom, to }),
    getPower({ from: performanceFrom, to }),
    getRunningDynamics({ from: performanceFrom, to }),
    getLoad({ from: performanceFrom, to }),
    getActivity({ from: activityFrom, to }),
    getDistance({ from: shortFrom, to }),
    getEnergy({ from: shortFrom, to }),
    getZoneTimeDistribution({ from: performanceFrom, to }),
    listWorkouts({ type: "Running", from: performanceFrom, to, limit: RUN_LIMIT }),
  ]);

  const runRows =
    workoutsResult.ok && workoutsResult.data.length > 0
      ? await Promise.all(
          workoutsResult.data.map(async (workout) => {
            const [detail, efficiency, stats, events, metadata, routes] = await Promise.all([
              getWorkoutDetail(workout.id),
              getWorkoutEfficiency(workout.id),
              getWorkoutStats(workout.id),
              getWorkoutEvents(workout.id),
              getWorkoutMetadata(workout.id),
              getWorkoutRoutes(workout.id),
            ]);
            return { workout, detail, efficiency, stats, events, metadata, routes };
          }),
        )
      : [];

  return (
    <div>
      <div className="kicker">
        <span>Endurance</span>
        <span>·</span>
        <span>{PERFORMANCE_WINDOW_DAYS}-day window</span>
      </div>
      <h2 className="page-title">
        Performance, <em>fully instrumented.</em>
      </h2>
      <p className="page-subtitle">
        Trend reporting across aerobic fitness, recovery, run economy, power, training load,
        activity volume, workout statistics, route context, and sample-based endurance KPIs.
      </p>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <MetricCard
          title="VO2 Max"
          value={latestMetric(vo2Result, "avg_vo2max", (v) => formatNumber(v, 1))}
          sub={trendText(vo2Result, "avg_vo2max", "mL/kg/min")}
          tip="Apple Health cardio fitness readings averaged by UTC day."
        />
        <MetricCard
          title="Resting HR"
          value={latestMetric(rollingResult, "avg_rhr_7d", (v) => `${formatNumber(v, 1)} bpm`)}
          sub={`${RHR_WINDOW_DAYS}-day rolling view`}
          tip="7-day rolling resting heart rate. Lower is usually better only when recovery and training context agree."
        />
        <MetricCard
          title="HRV"
          value={latestMetric(hrvResult, "avg_hrv", (v) => `${formatNumber(v, 1)} ms`)}
          sub={trendText(hrvResult, "avg_hrv", "ms")}
          tip="Daily average SDNN HRV from Apple Health."
        />
        <MetricCard
          title="Training Load"
          value={loadResult.ok ? formatNumber(sumLoad(loadResult.data), 0) : "—"}
          sub={loadResult.ok ? `${loadResult.data.length} loaded workouts` : "Unavailable"}
          tip="Workout duration multiplied by average HR for workouts with HR coverage."
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <RestingHRTrendCard result={rollingResult} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <ChartCard
          title="Readiness trend"
          tip="Rolling resting HR and HRV in the same time window. Divergence is often more useful than either line alone."
          errors={[rollingResult, hrvResult]}
          empty={!hasRows(rollingResult) && !hasRows(hrvResult)}
        >
          <LineChart
            key={chartDataKey("readiness", [rollingResult, hrvResult])}
            series={[
              lineSeries(rollingResult, "7-day RHR", "avg_rhr_7d", "#FF6B4A"),
              lineSeries(hrvResult, "HRV", "avg_hrv", "#5FD3F3"),
            ].filter(isSeries)}
            yAxisLabel="bpm / ms"
            height={300}
          />
        </ChartCard>

        <ChartCard
          title="Cardio fitness"
          tip="VO2 Max daily average. Useful as a long-term aerobic signal, not a single-workout score."
          errors={[vo2Result]}
          empty={!hasRows(vo2Result)}
        >
          <LineChart
            key={chartDataKey("vo2", vo2Result)}
            series={[lineSeries(vo2Result, "VO2 Max", "avg_vo2max", "#D8FF3D")].filter(isSeries)}
            yAxisLabel="mL/kg/min"
            height={300}
          />
        </ChartCard>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <ChartCard
          title="Running output"
          tip="Daily average running speed and power from sample-level Apple Health performance records."
          errors={[speedResult, powerResult]}
          empty={!hasRows(speedResult) && !hasRows(powerResult)}
        >
          <LineChart
            key={chartDataKey("output", [speedResult, powerResult])}
            series={[
              lineSeries(speedResult, "Speed m/s", "avg_speed", "#7FE09D"),
              lineSeries(powerResult, "Power W", "avg_power", "#F5A524"),
            ].filter(isSeries)}
            yAxisLabel="m/s / W"
            height={300}
          />
        </ChartCard>

        <ChartCard
          title="Running mechanics"
          tip="Vertical oscillation, ground contact time, and stride length from supported running workouts."
          errors={[dynamicsResult]}
          empty={!hasRows(dynamicsResult)}
        >
          <LineChart
            key={chartDataKey("dynamics", dynamicsResult)}
            series={[
              lineSeries(dynamicsResult, "Vert osc cm", "avg_vertical_oscillation_cm", "#BFA6FF"),
              lineSeries(dynamicsResult, "GCT ms", "avg_ground_contact_time_ms", "#FF5D8F"),
              lineSeries(dynamicsResult, "Stride m", "avg_stride_length_m", "#5FD3F3"),
            ].filter(isSeries)}
            yAxisLabel="mixed"
            height={300}
          />
        </ChartCard>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <RunKpiChart rows={runRows} metric="pace" />
        <RunKpiChart rows={runRows} metric="decoupling" />
        <RunKpiChart rows={runRows} metric="z2" />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <ChartCard
          title="Activity volume"
          tip="Weekly workout count and duration across all workout types."
          errors={[activityResult]}
          empty={!hasRows(activityResult)}
        >
          <LineChart
            key={chartDataKey("activity", activityResult)}
            series={[
              lineSeries(activityResult, "Workouts", "workout_count", "#D8FF3D"),
              activityHoursSeries(activityResult),
            ].filter(isSeries)}
            yAxisLabel="count / h"
            height={300}
          />
        </ChartCard>

        <ChartCard
          title="Daily fuel and distance"
          tip="Last 30 days of distance and active energy. This pairs training volume with energy output."
          errors={[distanceResult, energyResult]}
          empty={!hasRows(distanceResult) && !hasRows(energyResult)}
        >
          <LineChart
            key={chartDataKey("volume", [distanceResult, energyResult])}
            series={[
              distanceKmSeries(distanceResult),
              lineSeries(energyResult, "Active kcal", "active_kcal", "#F5A524"),
            ].filter(isSeries)}
            yAxisLabel="km / kcal"
            height={300}
          />
        </ChartCard>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <CardioZoneTimeChart result={zoneTimeResult} />
        <ZoneShareChart rows={runRows} />
        <RunContextCard rows={runRows} />
      </div>

      <div className="card">
        <CardTitle
          title="Recent runs"
          tip="Most recent running sessions with sample-derived efficiency and Apple workout statistics where available."
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

function RestingHRTrendCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getRestingHRRolling>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="card">
        <CardTitle
          title="Resting HR trend"
          tip="7-day rolling resting heart rate trend over the most recent 60-day window."
        />
        <ErrorBanner title="Could not load resting HR trend" detail={result.message} />
      </div>
    );
  }

  if (result.data.length === 0) {
    return (
      <div className="card">
        <CardTitle
          title="Resting HR trend"
          tip="7-day rolling resting heart rate trend over the most recent 60-day window."
        />
        <div className="empty-state">No resting-HR rows are available for this window.</div>
      </div>
    );
  }

  const summary = summarizeRestingHR(result.data);
  const series = [
    {
      name: "7-day RHR",
      color: "#FF6B4A",
      data: result.data.map(
        (point) => [`${point.day}T00:00:00Z`, point.avg_rhr_7d] as [string, number],
      ),
    },
  ];

  return (
    <div className="card">
      <CardTitle
        title="Resting HR trend"
        tip="7-day rolling resting heart rate trend over the most recent 60-day window."
      />
      <div className="context-grid" style={{ marginBottom: 16 }}>
        <MetricMini label="Latest" value={`${formatNumber(summary.latest, 1)} bpm`} />
        <MetricMini label="Change" value={formatSignedBpm(summary.delta)} />
        <MetricMini label="Low" value={`${formatNumber(summary.low, 1)} bpm`} />
        <MetricMini label="High" value={`${formatNumber(summary.high, 1)} bpm`} />
      </div>
      <LineChart
        key={chartDataKey("resting-hr-trend", series)}
        series={series}
        yAxisLabel="bpm"
        height={340}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  tip,
}: {
  title: string;
  value: string;
  sub: string;
  tip: string;
}): React.ReactElement {
  return (
    <div className="card metric-card">
      <CardTitle title={title} tip={tip} />
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function ChartCard({
  title,
  tip,
  errors,
  empty,
  children,
}: {
  title: string;
  tip: string;
  errors: Array<FetchResult<unknown>>;
  empty: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const failed = errors.find((result) => !result.ok);
  return (
    <div className="card">
      <CardTitle title={title} tip={tip} />
      {failed && !failed.ok ? (
        <ErrorBanner title={`Could not load ${title.toLowerCase()}`} detail={failed.message} />
      ) : empty ? (
        <div className="empty-state">No rows are available for this window.</div>
      ) : (
        children
      )}
    </div>
  );
}

function RunKpiChart({
  rows,
  metric,
}: {
  rows: PerformanceRunRow[];
  metric: "pace" | "decoupling" | "z2";
}): React.ReactElement {
  const config = {
    pace: {
      title: "Pace at fixed HR",
      tip: "Pace at 120-130 bpm. Lower seconds per km is faster at the same aerobic cost.",
      name: "sec/km",
      color: "#D8FF3D",
      yAxis: "sec/km",
      value: (row: PerformanceRunRow) =>
        row.efficiency.ok ? row.efficiency.data.pace_at_hr.pace_sec_per_km : null,
    },
    decoupling: {
      title: "First-hour decoupling",
      tip: "Percent drop in speed-per-heartbeat efficiency between the first and second half of the first 45-60 minutes.",
      name: "Decoupling",
      color: "#FF6B4A",
      yAxis: "%",
      value: (row: PerformanceRunRow) =>
        row.efficiency.ok ? row.efficiency.data.decoupling.decoupling_pct : null,
    },
    z2: {
      title: "Z2 share by run",
      tip: "Sample-based share of workout HR points that fall in zone 2.",
      name: "Z2",
      color: "#5FD3F3",
      yAxis: "%",
      value: (row: PerformanceRunRow) =>
        row.detail.ok && row.detail.data.z2_ratio !== null ? row.detail.data.z2_ratio * 100 : null,
    },
  }[metric];
  const data = rows
    .slice()
    .reverse()
    .map((row) => [row.workout.start_ts, config.value(row)] as [string, number | null])
    .filter((point): point is [string, number] => point[1] !== null);

  return (
    <ChartCard title={config.title} tip={config.tip} errors={[]} empty={data.length === 0}>
      <LineChart
        key={chartDataKey(config.title, data)}
        series={[{ name: config.name, color: config.color, data }]}
        yAxisLabel={config.yAxis}
        height={260}
      />
    </ChartCard>
  );
}

function ZoneShareChart({ rows }: { rows: PerformanceRunRow[] }): React.ReactElement {
  const chartRows = rows
    .slice(0, 10)
    .reverse()
    .filter((row) => row.detail.ok && row.detail.data.z2_ratio !== null);
  return (
    <ChartCard
      title="Run intensity mix"
      tip="Each bar splits a recent run into Z2 and non-Z2 heart-rate sample share."
      errors={[]}
      empty={chartRows.length === 0}
    >
      <StackedBar
        key={chartDataKey("zone-share", chartRows)}
        categories={chartRows.map((row) => shortDate(row.workout.start_ts))}
        series={[
          {
            name: "Z2",
            color: "#5FD3F3",
            data: chartRows.map((row) =>
              row.detail.ok && row.detail.data.z2_ratio !== null
                ? row.detail.data.z2_ratio * 100
                : 0,
            ),
          },
          {
            name: "Other",
            color: "#354541",
            data: chartRows.map((row) =>
              row.detail.ok && row.detail.data.z2_ratio !== null
                ? (1 - row.detail.data.z2_ratio) * 100
                : 0,
            ),
          },
        ]}
        yAxisLabel="%"
        height={300}
      />
    </ChartCard>
  );
}

function CardioZoneTimeChart({
  result,
}: {
  result: Awaited<ReturnType<typeof getZoneTimeDistribution>>;
}): React.ReactElement {
  return (
    <ChartCard
      title="Cardio zones distribution"
      tip="Estimated workout time in each HR zone. Intervals are derived from consecutive HR samples and capped to avoid sparse-sample overcounting."
      errors={[result]}
      empty={!hasRows(result)}
    >
      <StackedBar
        key={chartDataKey("zone-time", result)}
        categories={result.ok ? result.data.map((row) => row.zone) : []}
        series={[
          {
            name: "Minutes",
            color: "#D8FF3D",
            data: result.ok ? result.data.map((row) => row.duration_sec / 60) : [],
          },
        ]}
        yAxisLabel="min"
        height={300}
      />
      {result.ok ? (
        <div className="zone-time-summary">
          {result.data.map((row) => (
            <span key={row.zone}>
              {row.zone} {formatPercent(row.ratio, 0)}
            </span>
          ))}
        </div>
      ) : null}
    </ChartCard>
  );
}

function RunContextCard({ rows }: { rows: PerformanceRunRow[] }): React.ReactElement {
  const routeCount = rows.reduce(
    (sum, row) => sum + (row.routes.ok ? row.routes.data.length : 0),
    0,
  );
  const pauseCount = rows.reduce(
    (sum, row) =>
      sum +
      (row.events.ok
        ? row.events.data.filter((event) => event.type === "HKWorkoutEventTypePause").length
        : 0),
    0,
  );
  const outdoorCount = rows.filter(
    (row) => getMetadataValue(row, "HKIndoorWorkout") === "0",
  ).length;
  const statsCoverage = rows.filter((row) => row.stats.ok && row.stats.data.length > 0).length;

  return (
    <div className="card">
      <CardTitle
        title="Workout context coverage"
        tip="Counts from parsed WorkoutStatistics, WorkoutEvent, WorkoutRoute, and metadata nodes."
      />
      <div className="context-grid">
        <MetricMini label="Stats" value={`${statsCoverage}/${rows.length}`} />
        <MetricMini label="Routes" value={String(routeCount)} />
        <MetricMini label="Pauses" value={String(pauseCount)} />
        <MetricMini label="Outdoor" value={`${outdoorCount}/${rows.length}`} />
      </div>
      <div className="context-note">
        Rebuild the local database from `export.xml` after this change to backfill historical
        workout statistics, events, metadata, and routes.
      </div>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
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
          <th>Distance</th>
          <th>Avg HR</th>
          <th>Avg Power</th>
          <th>Pace @ 120-130</th>
          <th>Decoupling</th>
          <th>Z2</th>
          <th>Context</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { workout, detail, efficiency } = row;
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
              <td>{formatWorkoutStat(row, "HKQuantityTypeIdentifierDistanceWalkingRunning")}</td>
              <td>{formatWorkoutStat(row, "HKQuantityTypeIdentifierHeartRate", "average")}</td>
              <td>{formatWorkoutStat(row, "HKQuantityTypeIdentifierRunningPower", "average")}</td>
              <td>{pace}</td>
              <td>{decoupling}</td>
              <td>{z2}</td>
              <td>
                <ContextTags row={row} />
              </td>
              <td>
                <Link href={`/workouts/${encodeURIComponent(workout.id)}`}>Detail</Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ContextTags({ row }: { row: PerformanceRunRow }): React.ReactElement {
  const tags: string[] = [];
  if (row.stats.ok && row.stats.data.length > 0) tags.push(`${row.stats.data.length} stats`);
  if (row.routes.ok && row.routes.data.length > 0) tags.push("route");
  if (getMetadataValue(row, "HKIndoorWorkout") === "0") tags.push("outdoor");
  if (row.events.ok) {
    const pauses = row.events.data.filter(
      (event) => event.type === "HKWorkoutEventTypePause",
    ).length;
    if (pauses > 0) tags.push(`${pauses} pause`);
  }
  if (tags.length === 0) return <>—</>;
  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function latestMetric<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  formatter: (value: number) => string,
): string {
  if (!result.ok || result.data.length === 0) return "—";
  const latest = result.data[result.data.length - 1];
  const value = latest?.[key];
  return typeof value === "number" ? formatter(value) : "—";
}

function trendText<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  unit: string,
): string {
  if (!result.ok || result.data.length < 2) return "Trend unavailable";
  const firstValue = result.data[0]?.[key];
  const lastValue = result.data[result.data.length - 1]?.[key];
  if (typeof firstValue !== "number" || typeof lastValue !== "number") return "Trend unavailable";
  const delta = lastValue - firstValue;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta, 1)} ${unit} vs first point`;
}

function lineSeries<T extends { day?: string; week?: string }, K extends keyof T>(
  result: FetchResult<T[]>,
  name: string,
  key: K,
  color: string,
): LineSeries | null {
  if (!result.ok) return null;
  const data = result.data
    .map((point) => {
      const date = point.day ?? point.week;
      const value = point[key];
      return typeof date === "string" && typeof value === "number"
        ? ([`${date}T00:00:00Z`, value] as [string, number])
        : null;
    })
    .filter((point): point is [string, number] => point !== null);
  return data.length === 0 ? null : { name, color, data };
}

function activityHoursSeries(result: Awaited<ReturnType<typeof getActivity>>): LineSeries | null {
  if (!result.ok) return null;
  const data = result.data.map(
    (point) => [`${point.week}T00:00:00Z`, point.total_duration_sec / 3600] as [string, number],
  );
  return data.length === 0 ? null : { name: "Hours", color: "#5FD3F3", data };
}

function distanceKmSeries(result: Awaited<ReturnType<typeof getDistance>>): LineSeries | null {
  if (!result.ok) return null;
  const data = result.data.map(
    (point) => [`${point.day}T00:00:00Z`, point.total_meters / 1000] as [string, number],
  );
  return data.length === 0 ? null : { name: "Distance km", color: "#7FE09D", data };
}

function isSeries(series: LineSeries | null): series is LineSeries {
  return series !== null;
}

function hasRows<T>(result: FetchResult<T[]>): boolean {
  return result.ok && result.data.length > 0;
}

function sumLoad(rows: LoadRow[]): number {
  return rows.reduce((sum, row) => sum + (row.load ?? 0), 0);
}

function summarizeRestingHR(rows: RestingHRRollingPoint[]): {
  latest: number;
  delta: number;
  low: number;
  high: number;
} {
  const first = rows[0]?.avg_rhr_7d ?? 0;
  const latest = rows[rows.length - 1]?.avg_rhr_7d ?? first;
  const values = rows.map((row) => row.avg_rhr_7d);
  return {
    latest,
    delta: latest - first,
    low: Math.min(...values),
    high: Math.max(...values),
  };
}

function formatSignedBpm(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)} bpm`;
}

function getStat(row: PerformanceRunRow, type: string): WorkoutStat | null {
  if (!row.stats.ok) return null;
  return row.stats.data.find((stat) => stat.type === type) ?? null;
}

function formatWorkoutStat(
  row: PerformanceRunRow,
  type: string,
  field: "average" | "sum" = "sum",
): string {
  const stat = getStat(row, type);
  if (stat === null) return "—";
  const value = stat[field];
  if (value === null) return "—";
  if (type === "HKQuantityTypeIdentifierHeartRate") return `${formatNumber(value, 0)} bpm`;
  if (type === "HKQuantityTypeIdentifierRunningPower") return `${formatNumber(value, 0)} W`;
  if (type === "HKQuantityTypeIdentifierDistanceWalkingRunning") {
    return stat.unit === "km"
      ? `${formatNumber(value, 2)} km`
      : `${formatNumber(value, 1)} ${stat.unit}`;
  }
  return stat.unit === null ? formatNumber(value, 1) : `${formatNumber(value, 1)} ${stat.unit}`;
}

function getMetadataValue(row: PerformanceRunRow, key: string): string | null {
  if (!row.metadata.ok) return null;
  return row.metadata.data.find((entry) => entry.key === key)?.value ?? null;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
