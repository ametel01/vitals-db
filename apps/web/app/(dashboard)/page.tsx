import { CardTitle } from "@/components/CardTitle";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart, type LineSeries } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import {
  deriveWeeklyActivity,
  getActivity,
  getDistance,
  getEnergy,
  getHRV,
  getLoad,
  getPower,
  getRecoveryFlag,
  getRestingHR,
  getSleepNights,
  getSleepSummary,
  getSpeed,
  getSteps,
  getVO2Max,
  getWalkingHR,
  getWeeklyZ2Minutes,
  listWorkouts,
} from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatIsoDate,
  formatIsoDateTime,
  formatNumber,
  formatPercent,
  formatSleepConsistencyMinutes,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type { ActivityPoint, RecoveryFlag, WorkoutSummary } from "@vitals/core";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const COLORS = {
  resting: "#8FB516",
  hrv: "#8F5DFF",
  sleep: "#3E91F2",
  vo2: "#A6DF22",
  steps: "#9AE13D",
  walking: "#BFA6FF",
  energy: "#FF8A3D",
  distance: "#70D6CF",
  speed: "#5FD3F3",
  power: "#F5A524",
  load: "#D8FF3D",
  z2: "#FF5D8F",
} as const;

export default async function DashboardPage(): Promise<React.ReactElement> {
  const to = todayIso();
  const from = windowStartIso(30);
  const activityFrom = windowStartIso(12 * 7);
  const readinessFrom = windowStartIso(7);

  const [
    recoveryFlag,
    restingHR,
    sleep,
    sleepNights,
    vo2max,
    hrv,
    steps,
    walkingHR,
    speed,
    power,
    distance,
    energy,
    load,
    weeklyZ2,
    activity,
    workouts,
  ] = await Promise.all([
    getRecoveryFlag({ from: readinessFrom, to }),
    getRestingHR({ from, to }),
    getSleepSummary({ from, to }),
    getSleepNights({ from, to }),
    getVO2Max({ from, to }),
    getHRV({ from, to }),
    getSteps({ from, to }),
    getWalkingHR({ from, to }),
    getSpeed({ from, to }),
    getPower({ from, to }),
    getDistance({ from, to }),
    getEnergy({ from, to }),
    getLoad({ from, to }),
    getWeeklyZ2Minutes({ from, to }),
    getActivity({ from: activityFrom, to }),
    listWorkouts({ from: activityFrom, to }),
  ]);

  return (
    <div className="overview-dashboard">
      <DashboardHeader from={from} to={to} recoveryFlag={recoveryFlag} />
      <OverviewModeNav />

      <section className="overview-kpi-grid" aria-label="Recovery overview metrics">
        <RestingHRTopCard result={restingHR} recoveryFlag={recoveryFlag} />
        <SleepTopCard result={sleep} nightsResult={sleepNights} />
        <VO2MaxTopCard result={vo2max} />
        <HRVTopCard result={hrv} recoveryFlag={recoveryFlag} />
        <StepsTopCard result={steps} />
      </section>

      <RecoveryTrendsCard
        restingHR={restingHR}
        hrv={hrv}
        sleepNights={sleepNights}
        vo2max={vo2max}
      />

      <section className="overview-metric-grid" aria-label="Supporting health and workout metrics">
        <WalkingHRMetricCard result={walkingHR} />
        <EnergyMetricCard result={energy} />
        <DistanceMetricCard result={distance} />
        <SpeedMetricCard result={speed} />
        <PowerMetricCard result={power} />
        <LoadMetricCard result={load} />
        <Zone2MetricCard result={weeklyZ2} />
        <StepsMetricCard result={steps} />
      </section>

      <section className="overview-workout-grid" aria-label="Workout summary">
        <WeeklyWorkoutSummaryCard
          activity={activity}
          workouts={workouts}
          distance={distance}
          energy={energy}
        />
        <RecentWorkoutsCard workouts={workouts} />
      </section>

      <RecoverySnapshotCard
        recoveryFlag={recoveryFlag}
        restingHR={restingHR}
        hrv={hrv}
        sleep={sleep}
      />
    </div>
  );
}

function DashboardHeader({
  from,
  to,
  recoveryFlag,
}: {
  from: string;
  to: string;
  recoveryFlag: Awaited<ReturnType<typeof getRecoveryFlag>>;
}): React.ReactElement {
  return (
    <header className="overview-header">
      <div className="overview-heading">
        <div className="kicker">
          <span className="live">Live signal</span>
          <span>·</span>
          <span>30-day window</span>
        </div>
        <h2 className="page-title">
          Your body, <em>read carefully.</em>
        </h2>
        <p className="page-subtitle">
          A quiet look at the numbers that matter — resting rhythms, sleep, oxygen, variability, and
          the work you&apos;ve logged.
        </p>
      </div>
      <div className="overview-header-tools">
        <div className="date-range-control" aria-label={`Date range ${from} to ${to}`}>
          <CalendarIcon />
          <span>
            {formatIsoDate(from)} – {formatIsoDate(to)}
          </span>
          <ChevronDownIcon />
        </div>
        <RecoveryFlagChip result={recoveryFlag} />
      </div>
    </header>
  );
}

function OverviewModeNav(): React.ReactElement {
  return (
    <nav className="overview-tabs" aria-label="Overview sections">
      <Link href="/" className="active" aria-current="page">
        <HeartIcon />
        <span>Recovery</span>
      </Link>
      <Link href="/performance">
        <TrendIcon />
        <span>Performance</span>
      </Link>
      <Link href="/sleep">
        <MoonIcon />
        <span>Sleep</span>
      </Link>
    </nav>
  );
}

function RecoveryFlagChip({
  result,
}: {
  result: Awaited<ReturnType<typeof getRecoveryFlag>>;
}): React.ReactElement {
  if (!result.ok) {
    return (
      <div className="recovery-chip-wrap">
        <button type="button" className="recovery-chip danger">
          <span className="recovery-chip-label">Recovery</span>
          <strong>UNAVAILABLE</strong>
          <div className="recovery-chip-bubble">Could not load recovery flag: {result.message}</div>
        </button>
      </div>
    );
  }

  const flag = result.data;
  return (
    <div className="recovery-chip-wrap">
      <button type="button" className={`recovery-chip ${flagTone(flag.flag)}`}>
        <span className="recovery-chip-label">Recovery</span>
        <strong>{flag.score}</strong>
        <span className={`tag ${flagTone(flag.flag)}`}>{flag.sample_quality} sample</span>
        <div className="recovery-chip-bubble">
          <div className="context-grid">
            <MiniMetric
              label="RHR"
              value={formatNullableDelta(flag.resting_hr_delta_bpm, " bpm")}
            />
            <MiniMetric label="HRV" value={formatNullableDelta(flag.hrv_delta_ms, " ms")} />
            <MiniMetric
              label="Sleep"
              value={
                flag.sleep_hours_per_day === null
                  ? "—"
                  : `${formatNumber(flag.sleep_hours_per_day, 1)} h`
              }
            />
            <MiniMetric
              label="Load"
              value={
                flag.acute_chronic_load_ratio === null
                  ? "—"
                  : `${formatNumber(flag.acute_chronic_load_ratio, 2)}x`
              }
            />
          </div>
          <div className="context-note">{flag.reasons[0] ?? "Recovery signal unavailable."}</div>
        </div>
      </button>
    </div>
  );
}

function RestingHRTopCard({
  result,
  recoveryFlag,
}: {
  result: Awaited<ReturnType<typeof getRestingHR>>;
  recoveryFlag: Awaited<ReturnType<typeof getRecoveryFlag>>;
}): React.ReactElement {
  if (!result.ok) {
    return <MetricCardError title="Resting HR" detail={result.message} compact />;
  }

  const metric = buildMetricFromPoints({
    points: result.data,
    value: (point) => point.avg_rhr,
    label: "Resting HR",
    unit: "bpm",
    color: COLORS.resting,
    decimals: 0,
    avgDecimals: 1,
    lowerIsBetter: true,
    deltaOverride: recoveryFlag.ok ? recoveryFlag.data.resting_hr_delta_bpm : null,
  });

  return (
    <CompactMetricCard
      title="Resting HR"
      icon={<HeartIcon />}
      metric={metric}
      sublabel="30-day avg"
    />
  );
}

function SleepTopCard({
  result,
  nightsResult,
}: {
  result: Awaited<ReturnType<typeof getSleepSummary>>;
  nightsResult: Awaited<ReturnType<typeof getSleepNights>>;
}): React.ReactElement {
  if (!result.ok) {
    return <MetricCardError title="Sleep" detail={result.message} compact />;
  }

  const points = nightsResult.ok
    ? nightsResult.data.map((night) => ({ day: night.day, value: night.asleep_hours }))
    : [];
  const latest = lastOf(points);
  const recordedNights = nightsResult.ok ? nightsResult.data.length : 0;
  const avg = recordedNights > 0 ? result.data.total_hours / recordedNights : null;
  const metric: MetricDisplay = {
    value: latest === undefined ? "—" : `${formatNumber(latest.value, 1)} h`,
    average: avg === null ? "—" : `${formatNumber(avg, 1)} h`,
    delta: latest === undefined || avg === null ? "—" : formatDelta(latest.value - avg, " h", 1),
    deltaTone:
      latest === undefined || avg === null ? "neutral" : latest.value >= avg ? "good" : "bad",
    series: makeSeries("Sleep", points, COLORS.sleep),
  };

  return (
    <CompactMetricCard title="Sleep" icon={<MoonIcon />} metric={metric} sublabel="30-day avg" />
  );
}

function VO2MaxTopCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getVO2Max>>;
}): React.ReactElement {
  if (!result.ok) {
    return <MetricCardError title="VO2 Max" detail={result.message} compact />;
  }

  const metric = buildMetricFromPoints({
    points: result.data,
    value: (point) => point.avg_vo2max,
    label: "VO2 Max",
    unit: "mL/kg/min",
    color: COLORS.vo2,
    decimals: 1,
    avgDecimals: 1,
  });

  return (
    <CompactMetricCard
      title="VO2 Max"
      icon={<RunnerIcon />}
      metric={metric}
      sublabel="30-day avg"
    />
  );
}

function HRVTopCard({
  result,
  recoveryFlag,
}: {
  result: Awaited<ReturnType<typeof getHRV>>;
  recoveryFlag: Awaited<ReturnType<typeof getRecoveryFlag>>;
}): React.ReactElement {
  if (!result.ok) {
    return <MetricCardError title="HRV" detail={result.message} compact />;
  }

  const metric = buildMetricFromPoints({
    points: result.data,
    value: (point) => point.avg_hrv,
    label: "HRV",
    unit: "ms",
    color: COLORS.hrv,
    decimals: 0,
    avgDecimals: 1,
    deltaOverride: recoveryFlag.ok ? recoveryFlag.data.hrv_delta_ms : null,
  });

  return (
    <CompactMetricCard title="HRV" icon={<HeartIcon />} metric={metric} sublabel="30-day avg" />
  );
}

function StepsTopCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSteps>>;
}): React.ReactElement {
  if (!result.ok) {
    return <MetricCardError title="Steps" detail={result.message} compact />;
  }

  const metric = buildMetricFromPoints({
    points: result.data,
    value: (point) => point.total_steps,
    label: "Steps",
    unit: "",
    color: COLORS.steps,
    decimals: 0,
    avgDecimals: 0,
  });

  return (
    <CompactMetricCard title="Steps" icon={<StepsIcon />} metric={metric} sublabel="30-day avg" />
  );
}

function RecoveryTrendsCard({
  restingHR,
  hrv,
  sleepNights,
  vo2max,
}: {
  restingHR: Awaited<ReturnType<typeof getRestingHR>>;
  hrv: Awaited<ReturnType<typeof getHRV>>;
  sleepNights: Awaited<ReturnType<typeof getSleepNights>>;
  vo2max: Awaited<ReturnType<typeof getVO2Max>>;
}): React.ReactElement {
  if (!restingHR.ok && !hrv.ok && !sleepNights.ok) {
    return (
      <div className="card overview-trends-card">
        <CardTitle
          title="Recovery trends"
          tip="Resting heart rate, HRV, and sleep across the active 30-day window."
        />
        <ErrorBanner
          title="Could not load recovery trends"
          detail="All recovery trend sources failed."
        />
      </div>
    );
  }

  const series: LineSeries[] = [
    ...(restingHR.ok
      ? [
          {
            name: "Resting HR (bpm)",
            color: COLORS.resting,
            yAxisIndex: 0,
            data: restingHR.data.map(
              (point) => [`${point.day}T00:00:00Z`, point.avg_rhr] as [string, number],
            ),
          },
        ]
      : []),
    ...(hrv.ok
      ? [
          {
            name: "HRV (ms)",
            color: COLORS.hrv,
            yAxisIndex: 1,
            data: hrv.data.map(
              (point) => [`${point.day}T00:00:00Z`, point.avg_hrv] as [string, number],
            ),
          },
        ]
      : []),
    ...(sleepNights.ok
      ? [
          {
            name: "Sleep (h)",
            color: COLORS.sleep,
            yAxisIndex: 2,
            data: sleepNights.data.map(
              (point) => [`${point.day}T00:00:00Z`, point.asleep_hours] as [string, number],
            ),
          },
        ]
      : []),
  ];

  return (
    <section className="card overview-trends-card" aria-labelledby="recovery-trends-title">
      <div className="overview-card-head">
        <div>
          <h2 id="recovery-trends-title">
            <span className="card-title-text">Recovery trends</span>
          </h2>
          <p>Key recovery metrics over the last 30 days.</p>
        </div>
        <div className="range-pill">30D</div>
      </div>
      {series.length === 0 ? (
        <div className="empty-state">No recovery trend samples in range.</div>
      ) : (
        <LineChart
          key={chartDataKey("recovery-trends", series)}
          series={series}
          yAxisLabels={["bpm", "ms", "h"]}
          height={270}
        />
      )}
      <div className="trend-summary-grid">
        <TrendSummary
          icon={<TrendIcon />}
          title="Resting HR"
          note="Lower is better"
          metric={metricSummary(restingHR.ok ? restingHR.data.map((p) => p.avg_rhr) : [], "bpm", 0)}
          color={COLORS.resting}
        />
        <TrendSummary
          icon={<TrendIcon />}
          title="HRV"
          note="Higher is better"
          metric={metricSummary(hrv.ok ? hrv.data.map((p) => p.avg_hrv) : [], "ms", 0)}
          color={COLORS.hrv}
        />
        <TrendSummary
          icon={<MoonIcon />}
          title="Sleep"
          note="Target 7-9h"
          metric={metricSummary(
            sleepNights.ok ? sleepNights.data.map((p) => p.asleep_hours) : [],
            "h",
            1,
          )}
          color={COLORS.sleep}
        />
        <TrendSummary
          icon={<RunnerIcon />}
          title="VO2 Max"
          note="Higher is better"
          metric={metricSummary(
            vo2max.ok ? vo2max.data.map((p) => p.avg_vo2max) : [],
            "mL/kg/min",
            1,
          )}
          color={COLORS.vo2}
        />
      </div>
    </section>
  );
}

function WalkingHRMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getWalkingHR>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Walking HR" detail={result.message} />;
  return (
    <SecondaryMetricCard
      title="Walking HR"
      icon={<HeartIcon />}
      metric={buildMetricFromPoints({
        points: result.data,
        value: (point) => point.avg_walking_hr,
        label: "Walking HR",
        unit: "bpm",
        color: COLORS.walking,
        decimals: 0,
        avgDecimals: 1,
        lowerIsBetter: true,
      })}
    />
  );
}

function EnergyMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getEnergy>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Active Energy" detail={result.message} />;
  return (
    <SecondaryMetricCard
      title="Active Energy"
      icon={<FlameIcon />}
      metric={buildMetricFromPoints({
        points: result.data,
        value: (point) => point.active_kcal,
        label: "Active Energy",
        unit: "kcal",
        color: COLORS.energy,
        decimals: 0,
        avgDecimals: 0,
      })}
    />
  );
}

function DistanceMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getDistance>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Distance" detail={result.message} />;
  const normalized = result.data.map((point) => ({
    day: point.day,
    value: point.total_meters / 1000,
  }));
  return (
    <SecondaryMetricCard
      title="Distance"
      icon={<PinIcon />}
      metric={buildMetricFromDailyValues({
        points: normalized,
        label: "Distance",
        unit: "km",
        color: COLORS.distance,
        decimals: 1,
        avgDecimals: 1,
      })}
    />
  );
}

function SpeedMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSpeed>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Running Speed" detail={result.message} />;
  return (
    <SecondaryMetricCard
      title="Running Speed"
      icon={<RunnerIcon />}
      metric={buildMetricFromPoints({
        points: result.data,
        value: (point) => point.avg_speed,
        label: "Running Speed",
        unit: "m/s",
        color: COLORS.speed,
        decimals: 2,
        avgDecimals: 2,
      })}
    />
  );
}

function PowerMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getPower>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Running Power" detail={result.message} />;
  return (
    <SecondaryMetricCard
      title="Running Power"
      icon={<BoltIcon />}
      metric={buildMetricFromPoints({
        points: result.data,
        value: (point) => point.avg_power,
        label: "Running Power",
        unit: "W",
        color: COLORS.power,
        decimals: 0,
        avgDecimals: 0,
      })}
    />
  );
}

function LoadMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getLoad>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Training Load" detail={result.message} />;
  const values = result.data
    .map((row, index) => ({ day: String(index + 1), value: row.load }))
    .filter((row): row is { day: string; value: number } => row.value !== null);
  return (
    <SecondaryMetricCard
      title="Training Load"
      icon={<DumbbellIcon />}
      metric={buildMetricFromDailyValues({
        points: values,
        label: "Training Load",
        unit: "",
        color: COLORS.load,
        decimals: 0,
        avgDecimals: 0,
        xAxisType: "category",
      })}
    />
  );
}

function Zone2MetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getWeeklyZ2Minutes>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Zone 2 Minutes" detail={result.message} />;
  const points = result.data.map((row) => ({
    day: row.week,
    value: row.z2_duration_sec / 60,
  }));
  return (
    <SecondaryMetricCard
      title="Zone 2 Minutes"
      icon={<HeartIcon />}
      metric={buildMetricFromDailyValues({
        points,
        label: "Zone 2 Minutes",
        unit: "min",
        color: COLORS.z2,
        decimals: 0,
        avgDecimals: 0,
      })}
    />
  );
}

function StepsMetricCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getSteps>>;
}): React.ReactElement {
  if (!result.ok) return <MetricCardError title="Steps" detail={result.message} />;
  return (
    <SecondaryMetricCard
      title="Steps"
      icon={<StepsIcon />}
      metric={buildMetricFromPoints({
        points: result.data,
        value: (point) => point.total_steps,
        label: "Steps",
        unit: "",
        color: COLORS.steps,
        decimals: 0,
        avgDecimals: 0,
      })}
    />
  );
}

function WeeklyWorkoutSummaryCard({
  activity,
  workouts,
  distance,
  energy,
}: {
  activity: Awaited<ReturnType<typeof getActivity>>;
  workouts: Awaited<ReturnType<typeof listWorkouts>>;
  distance: Awaited<ReturnType<typeof getDistance>>;
  energy: Awaited<ReturnType<typeof getEnergy>>;
}): React.ReactElement {
  const weekly = resolveWeeklyActivity(activity, workouts);
  if (!weekly.ok) {
    return (
      <div className="card workout-panel">
        <CardTitle
          title="Weekly workout summary"
          tip="Total workout minutes per ISO week across all workout types."
        />
        <ErrorBanner title="Could not load activity" detail={weekly.message} />
      </div>
    );
  }

  const totalCount = weekly.data.reduce((sum, row) => sum + row.workout_count, 0);
  const totalDuration = weekly.data.reduce((sum, row) => sum + row.total_duration_sec, 0);
  const totalDistanceKm = distance.ok
    ? distance.data.reduce((sum, row) => sum + row.total_meters, 0) / 1000
    : null;
  const totalEnergy = energy.ok ? energy.data.reduce((sum, row) => sum + row.active_kcal, 0) : null;
  const categories = weekly.data.map((row) => compactDateLabel(row.week));
  const series = [
    {
      name: "Hours",
      color: "#D8FF3D",
      data: weekly.data.map((row) => Number((row.total_duration_sec / 3600).toFixed(2))),
    },
  ];
  const breakdown = workouts.ok ? activityBreakdown(workouts.data) : [];

  return (
    <div className="card workout-panel">
      <div className="panel-title-row">
        <div>
          <h2>
            <span className="card-title-text">Weekly workout summary</span>
          </h2>
          <p>Last 12 weeks</p>
        </div>
        <Link href="/workouts" className="panel-action">
          View all
        </Link>
      </div>
      <div className="workout-stat-row">
        <MiniMetric label="Workouts" value={formatNumber(totalCount, 0)} />
        <MiniMetric label="Total time" value={formatDuration(totalDuration)} />
        <MiniMetric
          label="Distance"
          value={totalDistanceKm === null ? "—" : `${formatNumber(totalDistanceKm, 1)} km`}
        />
        <MiniMetric
          label="Active kcal"
          value={totalEnergy === null ? "—" : formatNumber(totalEnergy, 0)}
        />
      </div>
      {weekly.data.length === 0 ? (
        <div className="empty-state">No workouts in the last 12 weeks.</div>
      ) : (
        <StackedBar
          key={chartDataKey("weekly-workouts", { categories, series })}
          categories={categories}
          series={series}
          yAxisLabel="hours"
          height={210}
        />
      )}
      <div className="activity-breakdown">
        <h3>Top activities</h3>
        {breakdown.length === 0 ? (
          <div className="empty-state compact">No activity breakdown available.</div>
        ) : (
          breakdown.map((item) => (
            <div className="activity-row" key={item.type}>
              <span>{formatWorkoutType(item.type)}</span>
              <div className="activity-track">
                <span style={{ width: `${item.ratio * 100}%` }} />
              </div>
              <strong>{formatDuration(item.durationSec)}</strong>
              <em>{formatPercent(item.ratio, 0)}</em>
            </div>
          ))
        )}
      </div>
      <div className="workout-nudge">
        <StarIcon />
        <div>
          <strong>{totalCount > 0 ? "Keep it going" : "Ready when you are"}</strong>
          <span>
            {totalCount > 0
              ? "Consistency builds long-term gains."
              : "Your next logged workout will start the weekly pattern."}
          </span>
        </div>
      </div>
    </div>
  );
}

function RecentWorkoutsCard({
  workouts,
}: {
  workouts: Awaited<ReturnType<typeof listWorkouts>>;
}): React.ReactElement {
  if (!workouts.ok) {
    return (
      <div className="card workout-panel">
        <CardTitle
          title="Recent workouts"
          tip="Recent workout records from the selected activity window."
        />
        <ErrorBanner title="Could not load workouts" detail={workouts.message} />
      </div>
    );
  }

  const recent = workouts.data
    .slice()
    .sort((a, b) => b.start_ts.localeCompare(a.start_ts))
    .slice(0, 5);

  return (
    <div className="card workout-panel">
      <div className="panel-title-row">
        <h2>
          <span className="card-title-text">Recent workouts</span>
        </h2>
        <Link href="/workouts" className="panel-action">
          View all
        </Link>
      </div>
      {recent.length === 0 ? (
        <div className="empty-state">No recent workouts in range.</div>
      ) : (
        <div className="recent-workout-list">
          {recent.map((workout) => (
            <Link
              href={`/workouts/${encodeURIComponent(workout.id)}`}
              className="recent-workout-row"
              key={workout.id}
            >
              <span className="workout-icon">
                <WorkoutTypeIcon type={workout.type} />
              </span>
              <span className="workout-main">
                <strong>{formatWorkoutType(workout.type)}</strong>
                <em>{formatIsoDateTime(workout.start_ts)}</em>
              </span>
              <span>
                <strong>{formatDuration(workout.duration_sec)}</strong>
                <em>Time</em>
              </span>
              <span>
                <strong>{workout.source ?? "Watch"}</strong>
                <em>Source</em>
              </span>
              <ChevronRightIcon />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RecoverySnapshotCard({
  recoveryFlag,
  restingHR,
  hrv,
  sleep,
}: {
  recoveryFlag: Awaited<ReturnType<typeof getRecoveryFlag>>;
  restingHR: Awaited<ReturnType<typeof getRestingHR>>;
  hrv: Awaited<ReturnType<typeof getHRV>>;
  sleep: Awaited<ReturnType<typeof getSleepSummary>>;
}): React.ReactElement {
  if (!recoveryFlag.ok) {
    return (
      <section className="card recovery-snapshot">
        <CardTitle
          title="Recovery snapshot"
          tip="Current recovery status from the latest signals."
        />
        <ErrorBanner title="Could not load recovery snapshot" detail={recoveryFlag.message} />
      </section>
    );
  }

  const flag = recoveryFlag.data;
  const scoreTone = flagTone(flag.flag);
  const rhrStatus = statusFromDelta(flag.resting_hr_delta_bpm, true, "Positive trend", "Watch");
  const hrvStatus = statusFromDelta(flag.hrv_delta_ms, false, "Balanced", "Suppressed");
  const sleepStatus = sleepStatusFromFlag(flag);
  const loadStatus = loadStatusFromFlag(flag);

  return (
    <section className="card recovery-snapshot" aria-labelledby="recovery-snapshot-title">
      <div>
        <h2 id="recovery-snapshot-title">
          <span className="card-title-text">Recovery snapshot</span>
        </h2>
        <div className="stat-sub">30-day outlook</div>
      </div>
      <div className="snapshot-grid">
        <SnapshotBlock
          title="Resting HR"
          status={rhrStatus.label}
          tone={rhrStatus.tone}
          detail={
            flag.resting_hr_delta_bpm === null
              ? "Resting HR needs more samples for a current trend."
              : `Recent baseline is ${formatNullableDelta(flag.resting_hr_delta_bpm, " bpm")} vs normal.`
          }
          series={
            restingHR.ok
              ? makeSeries(
                  "Resting HR",
                  dailyValuePoints(restingHR.data, (p) => p.avg_rhr),
                  COLORS.resting,
                )
              : null
          }
        />
        <SnapshotBlock
          title="HRV status"
          status={hrvStatus.label}
          tone={hrvStatus.tone}
          detail={
            flag.hrv_delta_ms === null
              ? "HRV needs more samples for a current trend."
              : `HRV is ${formatNullableDelta(flag.hrv_delta_ms, " ms")} vs normal range.`
          }
          series={
            hrv.ok
              ? makeSeries(
                  "HRV",
                  dailyValuePoints(hrv.data, (p) => p.avg_hrv),
                  COLORS.hrv,
                )
              : null
          }
        />
        <SnapshotBlock
          title="Sleep consistency"
          status={sleepStatus.label}
          tone={sleepStatus.tone}
          detail={
            sleep.ok && sleep.data.consistency_stddev !== null
              ? `Bedtime variability is ${formatSleepConsistencyMinutes(sleep.data.consistency_stddev)}.`
              : "Aim for regular bed and wake times as samples build."
          }
          series={null}
        />
        <SnapshotBlock
          title="Load balance"
          status={loadStatus.label}
          tone={loadStatus.tone}
          detail={
            flag.acute_chronic_load_ratio === null
              ? "Training load balance needs more workout history."
              : `Acute/chronic load ratio is ${formatNumber(flag.acute_chronic_load_ratio, 2)}x.`
          }
          series={null}
        />
        <div className={`recovery-score ${scoreTone}`}>
          <div
            className="score-ring"
            style={
              { "--score": `${Math.max(0, Math.min(flag.score, 100))}%` } as React.CSSProperties
            }
          >
            <strong>{flag.score}</strong>
          </div>
          <span>Recovery Score</span>
          <em>{scoreLabel(flag)}</em>
        </div>
      </div>
    </section>
  );
}

function CompactMetricCard({
  title,
  icon,
  metric,
  sublabel,
}: {
  title: string;
  icon: ReactNode;
  metric: MetricDisplay;
  sublabel: string;
}): React.ReactElement {
  return (
    <article className="card kpi-card">
      <div className="metric-title-row">
        <span className="metric-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <div className="metric-value-line">
        <strong>{metric.value}</strong>
      </div>
      <div className="metric-sub-line">
        <span>{sublabel}</span>
        <em className={metric.deltaTone}>{metric.delta}</em>
      </div>
      <Sparkline metric={metric} height={54} />
    </article>
  );
}

function SecondaryMetricCard({
  title,
  icon,
  metric,
}: {
  title: string;
  icon: ReactNode;
  metric: MetricDisplay;
}): React.ReactElement {
  return (
    <article className="card support-metric-card">
      <div className="metric-title-row">
        <span className="metric-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <span className="metric-eyebrow">30-day avg</span>
      <div className="support-card-body">
        <div>
          <strong>{metric.value}</strong>
          <em className={metric.deltaTone}>{metric.delta}</em>
        </div>
        <Sparkline metric={metric} height={68} />
      </div>
    </article>
  );
}

function MetricCardError({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail: string;
  compact?: boolean;
}): React.ReactElement {
  return (
    <article className={`card ${compact ? "kpi-card" : "support-metric-card"}`}>
      <div className="metric-title-row">
        <span className="metric-icon">
          <HeartIcon />
        </span>
        <h3>{title}</h3>
      </div>
      <ErrorBanner title={`Could not load ${title}`} detail={detail} />
    </article>
  );
}

function Sparkline({
  metric,
  height,
}: {
  metric: MetricDisplay;
  height: number;
}): React.ReactElement {
  if (metric.series.data.length === 0) {
    return <div className="sparkline-empty">No samples</div>;
  }
  return (
    <LineChart
      key={chartDataKey(`sparkline-${metric.series.name}`, metric.series)}
      series={[metric.series]}
      height={height}
      compact
      showLegend={false}
      xAxisType={metric.xAxisType ?? "time"}
    />
  );
}

function TrendSummary({
  icon,
  title,
  note,
  metric,
  color,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  metric: string;
  color: string;
}): React.ReactElement {
  return (
    <div className="trend-summary" style={{ "--summary-color": color } as React.CSSProperties}>
      <span className="metric-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
        <strong>{metric}</strong>
      </div>
    </div>
  );
}

function SnapshotBlock({
  title,
  status,
  tone,
  detail,
  series,
}: {
  title: string;
  status: string;
  tone: Tone;
  detail: string;
  series: LineSeries | null;
}): React.ReactElement {
  return (
    <div className={`snapshot-block ${tone}`}>
      <span>{title}</span>
      <strong>{status}</strong>
      <p>{detail}</p>
      {series === null ? null : (
        <LineChart
          key={chartDataKey(`snapshot-${title}`, series)}
          series={[series]}
          height={50}
          compact
          showLegend={false}
        />
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type Tone = "good" | "bad" | "neutral" | "warning";

interface MetricDisplay {
  value: string;
  average: string;
  delta: string;
  deltaTone: Tone;
  series: LineSeries;
  xAxisType?: "time" | "category";
}

function buildMetricFromPoints<T extends { day: string }>({
  points,
  value,
  label,
  unit,
  color,
  decimals,
  avgDecimals,
  lowerIsBetter = false,
  deltaOverride,
}: {
  points: T[];
  value: (point: T) => number;
  label: string;
  unit: string;
  color: string;
  decimals: number;
  avgDecimals: number;
  lowerIsBetter?: boolean;
  deltaOverride?: number | null | undefined;
}): MetricDisplay {
  return buildMetricFromDailyValues({
    points: dailyValuePoints(points, value),
    label,
    unit,
    color,
    decimals,
    avgDecimals,
    lowerIsBetter,
    deltaOverride,
  });
}

function buildMetricFromDailyValues({
  points,
  label,
  unit,
  color,
  decimals,
  avgDecimals,
  lowerIsBetter = false,
  deltaOverride,
  xAxisType = "time",
}: {
  points: Array<{ day: string; value: number }>;
  label: string;
  unit: string;
  color: string;
  decimals: number;
  avgDecimals: number;
  lowerIsBetter?: boolean;
  deltaOverride?: number | null | undefined;
  xAxisType?: "time" | "category" | undefined;
}): MetricDisplay {
  if (points.length === 0) {
    return {
      value: "—",
      average: "—",
      delta: "—",
      deltaTone: "neutral",
      series: { name: label, color, data: [] },
      xAxisType,
    };
  }

  const latest = points.at(-1);
  if (latest === undefined) {
    return {
      value: "—",
      average: "—",
      delta: "—",
      deltaTone: "neutral",
      series: { name: label, color, data: [] },
      xAxisType,
    };
  }
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const delta = deltaOverride ?? latest.value - average;
  const tone =
    delta === 0
      ? "neutral"
      : lowerIsBetter
        ? delta < 0
          ? "good"
          : "bad"
        : delta > 0
          ? "good"
          : "bad";

  return {
    value: formatValue(latest.value, unit, decimals),
    average: formatValue(average, unit, avgDecimals),
    delta: formatDelta(delta, unit, decimals),
    deltaTone: tone,
    series: makeSeries(label, points, color, xAxisType),
    xAxisType,
  };
}

function dailyValuePoints<T extends { day: string }>(
  points: T[],
  value: (point: T) => number,
): Array<{ day: string; value: number }> {
  return points.map((point) => ({ day: point.day, value: value(point) }));
}

function makeSeries(
  name: string,
  points: Array<{ day: string; value: number }>,
  color: string,
  xAxisType: "time" | "category" = "time",
): LineSeries {
  return {
    name,
    color,
    data: points.map((point) => [
      xAxisType === "time" ? `${point.day}T00:00:00Z` : point.day,
      point.value,
    ]),
  };
}

function metricSummary(values: number[], unit: string, decimals: number): string {
  const latest = values.at(-1);
  if (latest === undefined) return "—";
  return formatValue(latest, unit, decimals);
}

function formatValue(value: number, unit: string, decimals: number): string {
  const formatted = formatNumber(value, decimals);
  return unit.length === 0 ? formatted : `${formatted} ${unit}`;
}

function formatDelta(value: number, unit: string, decimals: number): string {
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${formatNumber(value, decimals)}`;
  return unit.length === 0 ? formatted : `${formatted} ${unit}`;
}

function formatNullableDelta(value: number | null, unit: string): string {
  if (value === null) return "—";
  return formatDelta(value, unit.trim(), 1);
}

function flagTone(flag: RecoveryFlag["flag"]): "success" | "warning" | "danger" {
  if (flag === "green") return "success";
  if (flag === "yellow") return "warning";
  return "danger";
}

function statusFromDelta(
  delta: number | null,
  lowerIsBetter: boolean,
  goodLabel: string,
  badLabel: string,
): { label: string; tone: Tone } {
  if (delta === null) return { label: "Insufficient data", tone: "neutral" };
  if (Math.abs(delta) < 0.1) return { label: "Balanced", tone: "neutral" };
  const isGood = lowerIsBetter ? delta < 0 : delta > 0;
  return { label: isGood ? goodLabel : badLabel, tone: isGood ? "good" : "warning" };
}

function sleepStatusFromFlag(flag: RecoveryFlag): { label: string; tone: Tone } {
  if (flag.sleep_hours_per_day === null) return { label: "Unknown", tone: "neutral" };
  if (flag.sleep_hours_per_day >= 7) return { label: "Consistent", tone: "good" };
  if (flag.sleep_hours_per_day >= 6) return { label: "Fair", tone: "warning" };
  return { label: "Short", tone: "bad" };
}

function loadStatusFromFlag(flag: RecoveryFlag): { label: string; tone: Tone } {
  const ratio = flag.acute_chronic_load_ratio;
  if (ratio === null) return { label: "Unknown", tone: "neutral" };
  if (ratio >= 0.8 && ratio <= 1.3) return { label: "Optimal", tone: "good" };
  if (ratio > 1.3 && ratio <= 1.6) return { label: "Elevated", tone: "warning" };
  return { label: "Watch", tone: "bad" };
}

function scoreLabel(flag: RecoveryFlag): string {
  if (flag.flag === "green") return "Good";
  if (flag.flag === "yellow") return "Watch";
  return "Reduce";
}

function resolveWeeklyActivity(
  activity: Awaited<ReturnType<typeof getActivity>>,
  workouts: Awaited<ReturnType<typeof listWorkouts>>,
): { ok: true; data: ActivityPoint[] } | { ok: false; message: string } {
  if (activity.ok) return { ok: true, data: activity.data };
  if (workouts.ok) return { ok: true, data: deriveWeeklyActivity(workouts.data) };
  return { ok: false, message: activity.message };
}

function activityBreakdown(workouts: WorkoutSummary[]): Array<{
  type: string;
  durationSec: number;
  ratio: number;
}> {
  const totals = new Map<string, number>();
  for (const workout of workouts) {
    totals.set(workout.type, (totals.get(workout.type) ?? 0) + workout.duration_sec);
  }
  const totalDuration = Array.from(totals.values()).reduce((sum, duration) => sum + duration, 0);
  if (totalDuration <= 0) return [];
  return Array.from(totals.entries())
    .map(([type, durationSec]) => ({ type, durationSec, ratio: durationSec / totalDuration }))
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, 4);
}

function compactDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWorkoutType(type: string): string {
  return type
    .replace(/^HKWorkoutActivityType/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function lastOf<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

function HeartIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 15s-5.5-3.2-5.5-7.1A3 3 0 0 1 9 6.1a3 3 0 0 1 5.5 1.8C14.5 11.8 9 15 9 15Z" />
    </svg>
  );
}

function MoonIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M14.5 10.5A6 6 0 1 1 7.5 3.5a4.5 4.5 0 0 0 7 7Z" />
    </svg>
  );
}

function TrendIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 12.5 6 8.5l3 2.5 4.5-6" />
      <path d="M10.5 5h3v3" />
    </svg>
  );
}

function RunnerIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="11.8" cy="3.2" r="1.5" />
      <path d="m9.8 6.1-2.2 2.6 2.9 1.2 2.7 3.9" />
      <path d="m7.6 8.7-2.2 5.1" />
      <path d="m10.5 9.9-3.3 4" />
      <path d="m10.4 6.1 2.2 2.2 2.3.2" />
    </svg>
  );
}

function StepsIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6.2 4.3c1.1 0 1.9.9 1.9 2.1 0 1.5-.7 3-2.1 3s-2.2-1.1-2.2-2.6c0-1.4 1-2.5 2.4-2.5Z" />
      <path d="M12.4 7.5c1 0 1.8.8 1.8 2 0 1.4-.7 2.8-2 2.8-1.4 0-2.1-1-2.1-2.5 0-1.3 1-2.3 2.3-2.3Z" />
    </svg>
  );
}

function FlameIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M9 15.5c-2.7 0-4.7-1.8-4.7-4.5 0-2.1 1.4-3.7 2.5-4.7.4 1.2 1 1.9 1.8 2.2C8.4 6.5 9.4 4.1 11.5 2.5c.2 2.1 2.2 3.5 2.2 6.5 0 3.8-2.3 6.5-4.7 6.5Z" />
    </svg>
  );
}

function PinIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M9 15.5s5-4.2 5-8.3a5 5 0 0 0-10 0c0 4.1 5 8.3 5 8.3Z" />
      <circle cx="9" cy="7.2" r="1.6" />
    </svg>
  );
}

function BoltIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m9.8 1.8-5 8.1h3.8l-.4 6.3 5-8.4H9.5l.3-6Z" />
    </svg>
  );
}

function DumbbellIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 7v4M5 6v6m8-6v6m2.5-5v4M5 9h8" />
    </svg>
  );
}

function CalendarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2.7" y="3.5" width="12.6" height="11.2" rx="2" />
      <path d="M5.5 2.2v3M12.5 2.2v3M2.8 7h12.4" />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="m5 7 4 4 4-4" />
    </svg>
  );
}

function ChevronRightIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="m7 4 5 5-5 5" />
    </svg>
  );
}

function StarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m9 2.4 1.8 4 4.3.5-3.2 2.9.8 4.2L9 11.9 5.3 14l.8-4.2-3.2-2.9 4.3-.5L9 2.4Z" />
    </svg>
  );
}

function WorkoutTypeIcon({ type }: { type: string }): React.ReactElement {
  const normalized = type.toLowerCase();
  if (normalized.includes("cycling")) return <DumbbellIcon />;
  if (normalized.includes("strength")) return <DumbbellIcon />;
  if (normalized.includes("walk")) return <StepsIcon />;
  return <RunnerIcon />;
}
