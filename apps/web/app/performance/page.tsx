import { CardTitle } from "@/components/CardTitle";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart, type LineSeries } from "@/components/charts/LineChart";
import {
  type FetchResult,
  getAdvancedCompositeReport,
  getHRAtPace,
  getHRV,
  getLoad,
  getPerformanceRunRows,
  getPower,
  getRestingHRRolling,
  getRunningDynamics,
  getSpeed,
  getVO2Max,
  getWeeklyZ2Minutes,
  getWorkoutRecoveryTimes,
  getZoneTimeDistribution,
} from "@/lib/api";
import {
  chartDataKey,
  formatDuration,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatPercentValue,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type {
  AdvancedCompositeReportSection,
  CompositeResult,
  LoadRow,
  WorkoutDetail,
  WorkoutEfficiency,
  WorkoutEvent,
  WorkoutMetadata,
  WorkoutPerformanceRunRow as WorkoutPerformanceRunRowDto,
  WorkoutRoute,
  WorkoutStat,
  WorkoutSummary,
} from "@vitals/core";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export const metadata: Metadata = {
  title: "Performance | Vital",
  description:
    "Endurance analytics across aerobic fitness, recovery, run economy, load, and workout context.",
};

export const dynamic = "force-dynamic";

const CHART_WINDOW_DAYS = 90;
const RUN_LIMIT = 14;
const EMPTY_VALUE = "—";

type Tone = "success" | "warning" | "danger" | "neutral";
type Accent = "lime" | "coral" | "violet" | "ice" | "amber" | "chlorophyll";

interface PerformanceRunRow {
  workout: WorkoutSummary;
  detail: FetchResult<WorkoutDetail>;
  efficiency: FetchResult<WorkoutEfficiency>;
  stats: FetchResult<WorkoutStat[]>;
  events: FetchResult<WorkoutEvent[]>;
  metadata: FetchResult<WorkoutMetadata[]>;
  routes: FetchResult<WorkoutRoute[]>;
}

interface InsightCardModel {
  title: string;
  answer: string;
  meta: string;
  status: string;
  tone: Tone;
  accent: Accent;
  visual: "line" | "bars" | "flags";
  values: number[];
  footer: string;
}

interface MetricSparklineModel {
  title: string;
  value: string;
  unit: string;
  sub: string;
  tip: string;
  accent: Accent;
  series: LineSeries[];
}

interface BenchmarkRow {
  id: string;
  date: string;
  workout: string;
  duration: string;
  distance: string;
  avgHr: string;
  drift: string;
  load: string;
  loadClass: string;
  tone: Tone;
}

interface GuidanceModel {
  changed: string;
  meaning: string;
  actions: string[];
  footer: string;
}

interface DashboardModel {
  dateRangeLabel: string;
  forecast: {
    label: string;
    recommendation: string;
    tone: Tone;
    values: number[];
  };
  insightCards: InsightCardModel[];
  metricCards: MetricSparklineModel[];
  primaryTrendSeries: LineSeries[];
  primaryInsight: string;
  driftSummary: { avg: number | null; count: number; series: LineSeries[] };
  decouplingSummary: { avg: number | null; count: number; series: LineSeries[] };
  cardiacFlags: { count: number; series: LineSeries[] };
  mechanics: Array<{ label: string; value: string; series: number[] }>;
  zoneShare: { z2Ratio: number | null; totalDuration: number; rows: ZoneBarRow[] };
  overlap: { value: number | null; series: LineSeries[] };
  benchmarkRows: BenchmarkRow[];
  guidance: GuidanceModel;
}

interface ZoneBarRow {
  zone: string;
  ratio: number;
  minutes: number;
}

function okResult<T>(data: T): FetchResult<T> {
  return { ok: true, data };
}

function toPerformanceRunRow(row: WorkoutPerformanceRunRowDto): PerformanceRunRow {
  return {
    workout: row.workout,
    detail: okResult(row.detail),
    efficiency: okResult(row.efficiency),
    stats: okResult(row.stats),
    events: okResult(row.events),
    metadata: okResult(row.metadata),
    routes: okResult(row.routes),
  };
}

export default async function PerformancePage(): Promise<React.ReactElement> {
  const to = todayIso();
  const chartFrom = windowStartIso(CHART_WINDOW_DAYS);

  const [
    reportResult,
    rollingResult,
    vo2Result,
    hrvResult,
    speedResult,
    powerResult,
    dynamicsResult,
    loadResult,
    zoneTimeResult,
    weeklyZ2Result,
    hrAtPaceResult,
    recoveryTimesResult,
    performanceRunsResult,
  ] = await Promise.all([
    getAdvancedCompositeReport({ from: chartFrom, to }),
    getRestingHRRolling({ from: chartFrom, to }),
    getVO2Max({ from: chartFrom, to }),
    getHRV({ from: chartFrom, to }),
    getSpeed({ from: chartFrom, to }),
    getPower({ from: chartFrom, to }),
    getRunningDynamics({ from: chartFrom, to }),
    getLoad({ from: chartFrom, to }),
    getZoneTimeDistribution({ from: chartFrom, to }),
    getWeeklyZ2Minutes({ from: chartFrom, to }),
    getHRAtPace({ from: chartFrom, to }),
    getWorkoutRecoveryTimes({ from: chartFrom, to }),
    getPerformanceRunRows({ from: chartFrom, to }, { limit: RUN_LIMIT }),
  ]);

  const runRows = performanceRunsResult.ok
    ? performanceRunsResult.data.map(toPerformanceRunRow)
    : [];
  const dashboard = buildDashboardModel({
    chartFrom,
    to,
    reportResult,
    rollingResult,
    vo2Result,
    hrvResult,
    dynamicsResult,
    loadResult,
    zoneTimeResult,
    recoveryTimesResult,
    runRows,
  });

  return (
    <div className="performance-dashboard">
      <header className="performance-header">
        <div className="performance-heading">
          <div className="kicker">
            <span>Endurance</span>
            <span>·</span>
            <span>{CHART_WINDOW_DAYS}-day window</span>
          </div>
          <h2 className="page-title">
            Performance, <em>fully instrumented.</em>
          </h2>
          <p className="page-subtitle">
            Trend reporting across aerobic fitness, training load, workout quality, and running
            efficiency to help you train smarter and recover deeper.
          </p>
        </div>
        <div className="performance-header-tools">
          <DateRangeControl label={dashboard.dateRangeLabel} />
          <ForecastCard forecast={dashboard.forecast} result={reportResult} />
        </div>
      </header>

      <section className="insight-grid" aria-label="Performance report insights">
        {dashboard.insightCards.map((card) => (
          <InsightCard key={card.title} card={card} />
        ))}
      </section>

      <section className="metric-sparkline-grid" aria-label="Primary performance metrics">
        {dashboard.metricCards.map((card) => (
          <MetricSparklineCard key={card.title} card={card} />
        ))}
      </section>

      <AerobicEfficiencyTrendCard
        errors={[vo2Result, rollingResult, hrvResult, loadResult]}
        series={dashboard.primaryTrendSeries}
        insight={dashboard.primaryInsight}
      />

      <PerformanceDiagnostics
        dashboard={dashboard}
        rollingResult={rollingResult}
        hrvResult={hrvResult}
        speedResult={speedResult}
        powerResult={powerResult}
        dynamicsResult={dynamicsResult}
        zoneTimeResult={zoneTimeResult}
        weeklyZ2Result={weeklyZ2Result}
      />

      <section className="performance-bottom-grid">
        <BenchmarkSessionsPanel
          rows={dashboard.benchmarkRows}
          runsResult={performanceRunsResult}
          recoveryResult={recoveryTimesResult}
        />
        <ActionableGuidancePanel guidance={dashboard.guidance} result={reportResult} />
      </section>

      <div className="performance-support-grid">
        <ChartCard
          title="HR at same pace"
          tip="Average HR when aligned speed samples are near 9:00/km. Lower HR at the same pace suggests better aerobic economy."
          errors={[hrAtPaceResult]}
          empty={!hasPaceRows(hrAtPaceResult)}
        >
          <LineChart
            key={chartDataKey("hr-at-pace", hrAtPaceResult)}
            series={[hrAtPaceSeries(hrAtPaceResult)].filter(isSeries)}
            yAxisLabel="bpm"
            height={220}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function buildDashboardModel({
  chartFrom,
  to,
  reportResult,
  rollingResult,
  vo2Result,
  hrvResult,
  dynamicsResult,
  loadResult,
  zoneTimeResult,
  recoveryTimesResult,
  runRows,
}: {
  chartFrom: string;
  to: string;
  reportResult: Awaited<ReturnType<typeof getAdvancedCompositeReport>>;
  rollingResult: Awaited<ReturnType<typeof getRestingHRRolling>>;
  vo2Result: Awaited<ReturnType<typeof getVO2Max>>;
  hrvResult: Awaited<ReturnType<typeof getHRV>>;
  dynamicsResult: Awaited<ReturnType<typeof getRunningDynamics>>;
  loadResult: Awaited<ReturnType<typeof getLoad>>;
  zoneTimeResult: Awaited<ReturnType<typeof getZoneTimeDistribution>>;
  recoveryTimesResult: Awaited<ReturnType<typeof getWorkoutRecoveryTimes>>;
  runRows: PerformanceRunRow[];
}): DashboardModel {
  const primaryTrendSeries = [
    lineSeries(vo2Result, "VO2 Max", "avg_vo2max", "#D8FF3D"),
    lineSeries(rollingResult, "Resting HR", "avg_rhr_7d", "#FF6B4A", 1),
    lineSeries(hrvResult, "HRV", "avg_hrv", "#BFA6FF", 2),
    loadSeries(loadResult, 3),
  ].filter(isSeries);

  const driftSummary = runMetricSummary(runRows, "HR drift", "#D8FF3D", (row) =>
    row.detail.ok ? row.detail.data.drift_pct : null,
  );
  const decouplingSummary = runMetricSummary(runRows, "Decoupling", "#D8FF3D", (row) =>
    row.efficiency.ok ? row.efficiency.data.decoupling.decoupling_pct : null,
  );
  const cardiacFlags = buildCardiacFlags(runRows);

  return {
    dateRangeLabel: `${formatDateShort(chartFrom)} - ${formatDateShort(to)}`,
    forecast: buildForecast(reportResult),
    insightCards: buildInsightCards(reportResult),
    metricCards: buildMetricCards({ vo2Result, rollingResult, hrvResult, loadResult }),
    primaryTrendSeries,
    primaryInsight: buildPrimaryInsight(reportResult, loadResult, hrvResult, rollingResult),
    driftSummary,
    decouplingSummary,
    cardiacFlags,
    mechanics: buildMechanics(dynamicsResult),
    zoneShare: buildZoneShare(zoneTimeResult),
    overlap: buildRecoveryOverlap(loadResult, recoveryTimesResult),
    benchmarkRows: buildBenchmarkRows(runRows),
    guidance: buildGuidance(reportResult, driftSummary.avg, decouplingSummary.avg),
  };
}

function DateRangeControl({ label }: { label: string }): React.ReactElement {
  return (
    <button className="date-range-control performance-date-control" type="button">
      <span aria-hidden="true">▦</span>
      <span>{label}</span>
      <span aria-hidden="true">⌄</span>
    </button>
  );
}

function ForecastCard({
  forecast,
  result,
}: {
  forecast: DashboardModel["forecast"];
  result: Awaited<ReturnType<typeof getAdvancedCompositeReport>>;
}): React.ReactElement {
  return (
    <aside className={`forecast-card ${forecast.tone}`}>
      <div>
        <span className="forecast-label">{forecast.label}</span>
        {!result.ok ? (
          <ErrorBanner title="Forecast unavailable" detail={result.message} />
        ) : (
          <strong>{forecast.recommendation}</strong>
        )}
      </div>
      <MiniSparkline values={forecast.values} accent="lime" />
    </aside>
  );
}

function InsightCard({ card }: { card: InsightCardModel }): React.ReactElement {
  return (
    <article className={`insight-card ${card.tone}`}>
      <div className="insight-card-topline">
        <span className={`insight-icon ${card.accent}`} aria-hidden="true">
          ✦
        </span>
        <span>{card.title}</span>
        <span className={`tag ${card.tone}`}>{card.status}</span>
      </div>
      <h3>{card.answer}</h3>
      <InsightVisual card={card} />
      <div className="insight-footer">
        <span>{card.footer}</span>
        <span>{card.meta}</span>
      </div>
    </article>
  );
}

function InsightVisual({ card }: { card: InsightCardModel }): React.ReactElement {
  if (card.visual === "bars") {
    return (
      <div className="insight-bars" aria-hidden="true">
        {card.values.map((value, index) => (
          <span className={card.accent} key={`${card.title}-${index}`} style={barStyle(value)} />
        ))}
      </div>
    );
  }
  if (card.visual === "flags") {
    return (
      <div className="insight-flags" aria-hidden="true">
        {card.values.map((value, index) => (
          <span
            className={index % 3 === 0 ? "coral" : "rose"}
            key={`${card.title}-${index}`}
            style={barStyle(value)}
          />
        ))}
      </div>
    );
  }
  return <MiniSparkline values={card.values} accent={card.accent} />;
}

function MetricSparklineCard({ card }: { card: MetricSparklineModel }): React.ReactElement {
  return (
    <article className={`metric-sparkline-card ${card.accent}`}>
      <CardTitle title={card.title} tip={card.tip} />
      <div className="metric-card-value">
        <strong>{card.value}</strong>
        {card.unit.length > 0 ? <span>{card.unit}</span> : null}
      </div>
      <div className="metric-card-context">{card.sub}</div>
      {card.series.length === 0 ? (
        <div className="sparkline-empty">No trend</div>
      ) : (
        <LineChart
          key={chartDataKey(`spark-${card.title}`, card.series)}
          series={card.series}
          height={70}
          compact
          showLegend={false}
        />
      )}
    </article>
  );
}

function AerobicEfficiencyTrendCard({
  errors,
  series,
  insight,
}: {
  errors: Array<FetchResult<unknown>>;
  series: LineSeries[];
  insight: string;
}): React.ReactElement {
  return (
    <ChartCard
      className="primary-trend-card"
      title="Aerobic efficiency trend"
      tip="VO2 Max, resting HR, HRV, and dated training load in the same 90-day window."
      errors={errors}
      empty={series.length === 0}
      action={<span className="trend-range-control">90D ⌄</span>}
    >
      <LineChart
        key={chartDataKey("aerobic-efficiency", series)}
        series={series}
        yAxisLabels={["mL/kg/min", "bpm", "ms", "load"]}
        height={340}
      />
      <div className="insight-strip">
        <span aria-hidden="true">✚</span>
        <strong>Insight</strong>
        <p>{insight}</p>
      </div>
    </ChartCard>
  );
}

function PerformanceDiagnostics({
  dashboard,
  rollingResult,
  hrvResult,
  speedResult,
  powerResult,
  dynamicsResult,
  zoneTimeResult,
  weeklyZ2Result,
}: {
  dashboard: DashboardModel;
  rollingResult: Awaited<ReturnType<typeof getRestingHRRolling>>;
  hrvResult: Awaited<ReturnType<typeof getHRV>>;
  speedResult: Awaited<ReturnType<typeof getSpeed>>;
  powerResult: Awaited<ReturnType<typeof getPower>>;
  dynamicsResult: Awaited<ReturnType<typeof getRunningDynamics>>;
  zoneTimeResult: Awaited<ReturnType<typeof getZoneTimeDistribution>>;
  weeklyZ2Result: Awaited<ReturnType<typeof getWeeklyZ2Minutes>>;
}): React.ReactElement {
  const driftTone = thresholdTone(dashboard.driftSummary.avg, 8, "danger", "success");
  const decouplingTone = thresholdTone(dashboard.decouplingSummary.avg, 5, "warning", "success");
  const overlapTone = thresholdTone(dashboard.overlap.value, 1, "warning", "success");

  return (
    <section className="diagnostic-grid" aria-label="Performance diagnostics">
      <DiagnosticMetricCard
        title="Avg HR drift"
        tip="Average first-half to second-half heart-rate drift across recent running workouts."
        value={formatNullablePercent(dashboard.driftSummary.avg)}
        sub={formatRunMetricCoverage(dashboard.driftSummary.count)}
        badge={driftTone === "danger" ? "High" : "Good"}
        tone={driftTone}
        series={dashboard.driftSummary.series}
        yAxisLabel="%"
      />
      <DiagnosticMetricCard
        title="Avg decoupling"
        tip="Average pace-per-heartbeat decoupling across recent runs with aligned HR and speed samples."
        value={formatNullablePercent(dashboard.decouplingSummary.avg)}
        sub={formatRunMetricCoverage(dashboard.decouplingSummary.count)}
        badge={decouplingTone === "warning" ? "Watch" : "Good"}
        tone={decouplingTone}
        series={dashboard.decouplingSummary.series}
        yAxisLabel="%"
      />
      <ChartCard
        className="diagnostic-card"
        title="Endurance trend"
        tip="Rolling resting HR and HRV together. Divergence is often more useful than either line alone."
        errors={[rollingResult, hrvResult]}
        empty={!hasRows(rollingResult) && !hasRows(hrvResult)}
      >
        <LineChart
          key={chartDataKey("endurance-trend", [rollingResult, hrvResult])}
          series={[
            lineSeries(rollingResult, "7-day RHR", "avg_rhr_7d", "#FF6B4A"),
            lineSeries(hrvResult, "HRV", "avg_hrv", "#5FD3F3", 1),
          ].filter(isSeries)}
          yAxisLabels={["bpm", "ms"]}
          height={188}
        />
      </ChartCard>
      <DiagnosticMetricCard
        title="Cardiac drift over time"
        tip="Recent running workouts where HR drift or workout flags suggest fatigue."
        value={String(dashboard.cardiacFlags.count)}
        sub="Flagged runs"
        badge={dashboard.cardiacFlags.count > 0 ? "High" : "Clear"}
        tone={dashboard.cardiacFlags.count > 0 ? "danger" : "success"}
        series={dashboard.cardiacFlags.series}
        yAxisLabel="%"
      />
      <ChartCard
        className="diagnostic-card"
        title="Running output"
        tip="Daily average running speed and power from sample-level Apple Health performance records."
        errors={[speedResult, powerResult]}
        empty={!hasRows(speedResult) && !hasRows(powerResult)}
      >
        <LineChart
          key={chartDataKey("running-output", [speedResult, powerResult])}
          series={[
            lineSeries(speedResult, "Speed m/s", "avg_speed", "#D8FF3D"),
            lineSeries(powerResult, "Power W", "avg_power", "#FF6B4A", 1),
          ].filter(isSeries)}
          yAxisLabels={["m/s", "W"]}
          height={188}
        />
      </ChartCard>
      <MechanicsCard rows={dashboard.mechanics} result={dynamicsResult} />
      <TimeInZonesCard
        zoneShare={dashboard.zoneShare}
        result={zoneTimeResult}
        weekly={weeklyZ2Result}
      />
      <DiagnosticMetricCard
        title="Recovery & exertion overlap"
        tip="Training load divided by hours until the next workout. Lower is usually easier to absorb."
        value={formatNullableNumber(dashboard.overlap.value, 2)}
        sub="Lower is better"
        badge={overlapTone === "warning" ? "Watch" : "Good"}
        tone={overlapTone}
        series={dashboard.overlap.series}
        yAxisLabel="index"
      />
    </section>
  );
}

function ChartCard({
  title,
  tip,
  errors,
  empty,
  children,
  className,
  action,
}: {
  title: string;
  tip: string;
  errors: Array<FetchResult<unknown>>;
  empty: boolean;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}): React.ReactElement {
  const failed = errors.find((result) => !result.ok);
  return (
    <div className={`card ${className ?? ""}`}>
      <div className="trend-card-header">
        <CardTitle title={title} tip={tip} />
        {action}
      </div>
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

function DiagnosticMetricCard({
  title,
  tip,
  value,
  sub,
  badge,
  tone,
  series,
  yAxisLabel,
}: {
  title: string;
  tip: string;
  value: string;
  sub: string;
  badge: string;
  tone: Tone;
  series: LineSeries[];
  yAxisLabel: string;
}): React.ReactElement {
  return (
    <ChartCard
      className="diagnostic-card"
      title={title}
      tip={tip}
      errors={[]}
      empty={series.length === 0}
    >
      <div className="diagnostic-value">
        <strong>{value}</strong>
        <span className={`tag ${tone}`}>{badge}</span>
      </div>
      <p>{sub}</p>
      <LineChart
        key={chartDataKey(title, series)}
        series={series}
        yAxisLabel={yAxisLabel}
        height={118}
        compact
        showLegend={false}
      />
    </ChartCard>
  );
}

function MechanicsCard({
  rows,
  result,
}: {
  rows: DashboardModel["mechanics"];
  result: Awaited<ReturnType<typeof getRunningDynamics>>;
}): React.ReactElement {
  return (
    <ChartCard
      className="diagnostic-card mechanics-card"
      title="Running mechanics"
      tip="Vertical oscillation, ground contact time, and stride length from supported running workouts."
      errors={[result]}
      empty={rows.length === 0}
    >
      <div className="mini-series-list">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <MiniSparkline values={row.series} accent="lime" />
          </div>
        ))}
      </div>
      <p className="diagnostic-note">30-day average</p>
    </ChartCard>
  );
}

function TimeInZonesCard({
  zoneShare,
  result,
  weekly,
}: {
  zoneShare: DashboardModel["zoneShare"];
  result: Awaited<ReturnType<typeof getZoneTimeDistribution>>;
  weekly: Awaited<ReturnType<typeof getWeeklyZ2Minutes>>;
}): React.ReactElement {
  const weeklyTotal = weekly.ok
    ? weekly.data.reduce((sum, row) => sum + row.z2_duration_sec, 0)
    : zoneShare.totalDuration;
  return (
    <ChartCard
      className="diagnostic-card zone-diagnostic-card"
      title="Time in zones"
      tip="Estimated workout time in each HR zone from capped workout HR-sample intervals."
      errors={[result, weekly]}
      empty={zoneShare.rows.length === 0}
    >
      <div className="diagnostic-value">
        <strong>
          {zoneShare.z2Ratio === null ? EMPTY_VALUE : formatPercent(zoneShare.z2Ratio, 0)}
        </strong>
        <span>Zone 2</span>
        <span className="tag success">Optimal</span>
      </div>
      <p>{formatDuration(weeklyTotal)} total</p>
      <div className="zone-bars">
        {zoneShare.rows.map((row) => (
          <div key={row.zone}>
            <span
              className={`zone-bar-fill ${row.zone.toLowerCase()}`}
              style={barStyle(row.ratio)}
            />
            <em>{row.zone}</em>
            <strong>{formatDuration(row.minutes * 60)}</strong>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function BenchmarkSessionsPanel({
  rows,
  runsResult,
  recoveryResult,
}: {
  rows: BenchmarkRow[];
  runsResult: Awaited<ReturnType<typeof getPerformanceRunRows>>;
  recoveryResult: Awaited<ReturnType<typeof getWorkoutRecoveryTimes>>;
}): React.ReactElement {
  return (
    <section className="card benchmark-panel">
      <div className="benchmark-panel-head">
        <CardTitle
          title="Recent benchmark sessions"
          tip="Recent running sessions with sample-derived efficiency and Apple workout statistics where available."
        />
        <Link className="panel-action" href="/workouts">
          View all
        </Link>
      </div>
      {!runsResult.ok ? (
        <ErrorBanner title="Could not load running workouts" detail={runsResult.message} />
      ) : !recoveryResult.ok ? (
        <ErrorBanner title="Could not load recovery context" detail={recoveryResult.message} />
      ) : rows.length === 0 ? (
        <div className="empty-state">No recent running workouts were found in this window.</div>
      ) : (
        <BenchmarkSessionsTable rows={rows} />
      )}
    </section>
  );
}

function BenchmarkSessionsTable({ rows }: { rows: BenchmarkRow[] }): React.ReactElement {
  return (
    <div className="benchmark-table-wrap">
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Workout</th>
            <th>Duration</th>
            <th>Avg HR</th>
            <th>HR drift</th>
            <th>Load</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className={`session-icon ${row.tone}`} aria-hidden="true">
                  ↟
                </span>
                <span>{row.date}</span>
              </td>
              <td>
                <Link href={`/workouts/${encodeURIComponent(row.id)}`}>{row.workout}</Link>
              </td>
              <td>
                <strong>{row.distance}</strong>
                <span>{row.duration}</span>
              </td>
              <td>{row.avgHr}</td>
              <td>{row.drift}</td>
              <td>
                <span>{row.loadClass}</span>
                <strong>{row.load}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="benchmark-table-footer">
        <span>Showing {rows.length} benchmark sessions</span>
        <Link href="/workouts">View all workouts →</Link>
      </div>
    </div>
  );
}

function ActionableGuidancePanel({
  guidance,
  result,
}: {
  guidance: GuidanceModel;
  result: Awaited<ReturnType<typeof getAdvancedCompositeReport>>;
}): React.ReactElement {
  return (
    <section className="card guidance-panel">
      <CardTitle
        title="Actionable guidance"
        tip="Coaching recommendations derived from report sections, recovery, drift, and load quality."
      />
      {!result.ok ? (
        <ErrorBanner title="Could not load guidance" detail={result.message} />
      ) : (
        <>
          <GuidanceCard title="What changed" body={guidance.changed} icon="◔" />
          <GuidanceCard title="What it means" body={guidance.meaning} icon="△" />
          <div className="guidance-card">
            <span className="guidance-icon" aria-hidden="true">
              ♢
            </span>
            <div>
              <h3>What to do next</h3>
              <ul className="guidance-checklist">
                {guidance.actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="guidance-footer">{guidance.footer}</div>
        </>
      )}
    </section>
  );
}

function GuidanceCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: string;
}): React.ReactElement {
  return (
    <div className="guidance-card">
      <span className="guidance-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function MiniSparkline({
  values,
  accent,
}: {
  values: number[];
  accent: Accent;
}): React.ReactElement {
  const points = sparklinePoints(values);
  return (
    <svg className={`mini-sparkline ${accent}`} viewBox="0 0 120 42" aria-hidden="true">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function buildForecast(
  result: Awaited<ReturnType<typeof getAdvancedCompositeReport>>,
): DashboardModel["forecast"] {
  if (!result.ok) {
    return {
      label: "Next week intensity",
      recommendation: "Report unavailable.",
      tone: "warning",
      values: [14, 18, 16, 22, 19, 28, 30, 26, 24, 25],
    };
  }
  const action = result.data.next_week_recommendation;
  return {
    label: "Next week intensity",
    recommendation: action.recommendation.replace(/^Next week:\s*/i, ""),
    tone: actionTone(action.kind),
    values:
      action.kind === "push"
        ? [12, 15, 18, 22, 26, 24, 29, 35, 38, 34]
        : [32, 30, 24, 26, 22, 21, 18, 20, 17, 16],
  };
}

function buildInsightCards(
  result: Awaited<ReturnType<typeof getAdvancedCompositeReport>>,
): InsightCardModel[] {
  const fallbackTitles = ["Fitness direction", "Load quality", "Recovery debt", "Workout flags"];
  if (!result.ok) {
    return fallbackTitles.map((title, index) => ({
      title,
      answer: "Signal unavailable.",
      meta: "report offline",
      status: "loading",
      tone: "warning",
      accent: insightAccent(index),
      visual: index === 1 ? "bars" : index === 3 ? "flags" : "line",
      values: generatedVisualValues(index),
      footer: "Awaiting samples",
    }));
  }
  return result.data.sections.map((section, index) => {
    const evidence = section.result.evidence.find((item) => item.value !== null);
    return {
      title: insightTitle(section),
      answer: section.result.answer,
      meta:
        evidence === undefined
          ? section.result.claim_strength.replaceAll("_", " ")
          : String(evidence.value),
      status: section.result.confidence,
      tone: tagTone(section.result.confidence),
      accent: insightAccent(index),
      visual: index === 1 ? "bars" : index === 3 ? "flags" : "line",
      values: generatedVisualValues(index),
      footer: `${sampleLabel(section.result.sample_quality)} · ${section.result.claim_strength.replaceAll("_", " ")}`,
    };
  });
}

function buildMetricCards({
  vo2Result,
  rollingResult,
  hrvResult,
  loadResult,
}: {
  vo2Result: Awaited<ReturnType<typeof getVO2Max>>;
  rollingResult: Awaited<ReturnType<typeof getRestingHRRolling>>;
  hrvResult: Awaited<ReturnType<typeof getHRV>>;
  loadResult: Awaited<ReturnType<typeof getLoad>>;
}): MetricSparklineModel[] {
  return [
    {
      title: "VO2 Max",
      value: latestMetric(vo2Result, "avg_vo2max", (value) => formatNumber(value, 1)),
      unit: "mL/kg/min",
      sub: trendText(vo2Result, "avg_vo2max", "vs first point"),
      tip: "Apple Health cardio fitness readings averaged by UTC day.",
      accent: "lime",
      series: [lineSeries(vo2Result, "VO2 Max", "avg_vo2max", "#D8FF3D")].filter(isSeries),
    },
    {
      title: "Resting HR",
      value: latestMetric(rollingResult, "avg_rhr_7d", (value) => formatNumber(value, 1)),
      unit: "bpm",
      sub: `${CHART_WINDOW_DAYS}-day rolling view`,
      tip: "7-day rolling resting heart rate. Lower is usually better only when recovery and training context agree.",
      accent: "coral",
      series: [lineSeries(rollingResult, "Resting HR", "avg_rhr_7d", "#FF6B4A")].filter(isSeries),
    },
    {
      title: "HRV",
      value: latestMetric(hrvResult, "avg_hrv", (value) => formatNumber(value, 1)),
      unit: "ms",
      sub: trendText(hrvResult, "avg_hrv", "vs first point"),
      tip: "Daily average SDNN HRV from Apple Health.",
      accent: "violet",
      series: [lineSeries(hrvResult, "HRV", "avg_hrv", "#BFA6FF")].filter(isSeries),
    },
    {
      title: "Training Load",
      value: loadResult.ok ? formatNumber(sumLoad(loadResult.data), 0) : EMPTY_VALUE,
      unit: "",
      sub: loadResult.ok ? `${loadResult.data.length} loaded workouts` : "Unavailable",
      tip: "Workout duration multiplied by average HR for workouts with HR coverage.",
      accent: "ice",
      series: [loadSeries(loadResult)].filter(isSeries),
    },
  ];
}

function buildPrimaryInsight(
  reportResult: Awaited<ReturnType<typeof getAdvancedCompositeReport>>,
  loadResult: Awaited<ReturnType<typeof getLoad>>,
  hrvResult: Awaited<ReturnType<typeof getHRV>>,
  rollingResult: Awaited<ReturnType<typeof getRestingHRRolling>>,
): string {
  if (reportResult.ok) {
    return reportResult.data.next_week_recommendation.recommendation;
  }
  const loadDelta = numericDelta(loadResult, "load");
  const hrvDelta = numericDelta(hrvResult, "avg_hrv");
  const rhrDelta = numericDelta(rollingResult, "avg_rhr_7d");
  if (loadDelta !== null && hrvDelta !== null && rhrDelta !== null) {
    return `Training load moved ${formatSigned(loadDelta)} while HRV moved ${formatSigned(hrvDelta)} and resting HR moved ${formatSigned(rhrDelta)}.`;
  }
  return "Collect more recent samples to connect fitness, recovery, and load into one interpretation.";
}

function buildCardiacFlags(rows: PerformanceRunRow[]): { count: number; series: LineSeries[] } {
  const data: Array<[string, number]> = [];
  let count = 0;
  for (const row of chronologicalRows(rows)) {
    const drift = row.detail.ok ? row.detail.data.drift_pct : null;
    if (drift !== null && Number.isFinite(drift)) {
      data.push([row.workout.start_ts, drift]);
      if (drift > 8) count += 1;
    }
  }
  return {
    count,
    series: data.length === 0 ? [] : [{ name: "Drift", color: "#FF6B4A", data }],
  };
}

function buildMechanics(
  result: Awaited<ReturnType<typeof getRunningDynamics>>,
): DashboardModel["mechanics"] {
  if (!result.ok || result.data.length === 0) return [];
  return [
    mechanicsRow(
      result.data,
      "Cadence",
      "avg_ground_contact_time_ms",
      (value) => `${formatNumber(60000 / value, 0)} spm`,
    ),
    mechanicsRow(
      result.data,
      "Stride length",
      "avg_stride_length_m",
      (value) => `${formatNumber(value, 2)} m`,
    ),
    mechanicsRow(
      result.data,
      "Vert. oscillation",
      "avg_vertical_oscillation_cm",
      (value) => `${formatNumber(value, 1)} cm`,
    ),
  ].filter((row) => row.series.length > 0);
}

function buildZoneShare(
  result: Awaited<ReturnType<typeof getZoneTimeDistribution>>,
): DashboardModel["zoneShare"] {
  if (!result.ok) return { z2Ratio: null, totalDuration: 0, rows: [] };
  const totalDuration = result.data.reduce((sum, row) => sum + row.duration_sec, 0);
  const z2 = result.data.find((row) => row.zone === "Z2") ?? null;
  return {
    z2Ratio: z2?.ratio ?? null,
    totalDuration,
    rows: result.data.map((row) => ({
      zone: row.zone,
      ratio: row.ratio,
      minutes: row.duration_sec / 60,
    })),
  };
}

function buildRecoveryOverlap(
  loadResult: Awaited<ReturnType<typeof getLoad>>,
  recoveryResult: Awaited<ReturnType<typeof getWorkoutRecoveryTimes>>,
): DashboardModel["overlap"] {
  if (!loadResult.ok || !recoveryResult.ok) return { value: null, series: [] };
  const loadByWorkout = new Map(loadResult.data.map((row) => [row.workout_id, row.load] as const));
  const data: Array<[string, number]> = [];
  for (const recovery of recoveryResult.data) {
    const load = loadByWorkout.get(recovery.workout_id) ?? null;
    if (
      load === null ||
      recovery.recovery_duration_sec === null ||
      recovery.recovery_duration_sec <= 0
    ) {
      continue;
    }
    data.push([recovery.start_ts, load / recovery.recovery_duration_sec / 10]);
  }
  const value = data.length === 0 ? null : average(data.map((item) => item[1]));
  return {
    value,
    series: data.length === 0 ? [] : [{ name: "Overlap", color: "#D8FF3D", data }],
  };
}

function buildBenchmarkRows(rows: PerformanceRunRow[]): BenchmarkRow[] {
  return rows.slice(0, 5).map((row) => {
    const drift = row.detail.ok ? row.detail.data.drift_pct : null;
    const load = row.detail.ok ? row.detail.data.load : null;
    return {
      id: row.workout.id,
      date: shortDate(row.workout.start_ts),
      workout: classifyRun(row),
      duration: formatDuration(row.workout.duration_sec),
      distance: formatWorkoutStat(row, "HKQuantityTypeIdentifierDistanceWalkingRunning"),
      avgHr: formatWorkoutStat(row, "HKQuantityTypeIdentifierHeartRate", "average"),
      drift: drift === null ? EMPTY_VALUE : formatPercentValue(drift, 1),
      load: load === null ? EMPTY_VALUE : formatNumber(load / 1000, 0),
      loadClass: loadClass(load),
      tone: drift !== null && drift > 8 ? "danger" : "success",
    };
  });
}

function buildGuidance(
  result: Awaited<ReturnType<typeof getAdvancedCompositeReport>>,
  driftAvg: number | null,
  decouplingAvg: number | null,
): GuidanceModel {
  if (!result.ok) {
    return {
      changed: "The report is unavailable.",
      meaning:
        "The dashboard can still show raw trends, but coaching guidance needs the composite report.",
      actions: ["Review source samples", "Re-run the report once the API is reachable"],
      footer: "Re-evaluate after the report endpoint recovers.",
    };
  }
  const sections = result.data.sections;
  const fitness = sectionByKey(sections, "fitness_direction");
  const recovery = sectionByKey(sections, "recovery_state");
  const load = sectionByKey(sections, "easy_run_quality");
  const actions = [
    result.data.next_week_recommendation.recommendation.replace(/^Next week:\s*/i, ""),
    driftAvg !== null && driftAvg > 8
      ? "Keep the next comparable run easier and watch whether drift improves."
      : "Keep one repeatable aerobic benchmark in the next 10-12 days.",
    decouplingAvg !== null && decouplingAvg > 5
      ? "Prioritize Zone 2 and easy recovery runs until decoupling settles."
      : "Maintain current easy-run quality and avoid adding intensity too quickly.",
  ];
  return {
    changed: fitness?.result.answer ?? "Fitness direction needs more samples.",
    meaning:
      recovery?.result.answer ??
      load?.result.answer ??
      "Recovery and load signals are still forming.",
    actions,
    footer: "Re-evaluate after your next 10-12 training days.",
  };
}

function mechanicsRow<
  K extends "avg_ground_contact_time_ms" | "avg_stride_length_m" | "avg_vertical_oscillation_cm",
>(
  rows: Array<Record<K, number | null>>,
  label: string,
  key: K,
  formatter: (value: number) => string,
): { label: string; value: string; series: number[] } {
  const series = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latest = series[series.length - 1];
  return {
    label,
    value: latest === undefined ? EMPTY_VALUE : formatter(latest),
    series,
  };
}

function sectionByKey(
  sections: AdvancedCompositeReportSection[],
  key: AdvancedCompositeReportSection["key"],
): AdvancedCompositeReportSection | null {
  return sections.find((section) => section.key === key) ?? null;
}

function insightTitle(section: AdvancedCompositeReportSection): string {
  const titles: Record<AdvancedCompositeReportSection["key"], string> = {
    fitness_direction: "Fitness direction",
    easy_run_quality: "Load quality",
    recovery_state: "Recovery debt",
    workout_diagnoses: "Workout flags",
  };
  return titles[section.key];
}

function lineSeries<T extends { day?: string; week?: string }, K extends keyof T>(
  result: FetchResult<T[]>,
  name: string,
  key: K,
  color: string,
  yAxisIndex = 0,
): LineSeries | null {
  if (!result.ok) return null;
  const data: Array<[string, number]> = [];
  for (const point of result.data) {
    const date = point.day ?? point.week;
    const value = point[key];
    if (typeof date === "string" && typeof value === "number" && Number.isFinite(value)) {
      data.push([`${date}T00:00:00Z`, value]);
    }
  }
  return data.length === 0 ? null : { name, color, data, yAxisIndex };
}

function loadSeries(
  result: Awaited<ReturnType<typeof getLoad>>,
  yAxisIndex = 0,
): LineSeries | null {
  if (!result.ok) return null;
  const data = result.data
    .filter((row) => row.start_ts.length > 0 && row.load !== null && Number.isFinite(row.load))
    .map((row) => [row.start_ts, row.load ?? 0] as [string, number]);
  return data.length === 0 ? null : { name: "Training Load", color: "#3E9BFF", data, yAxisIndex };
}

function hrAtPaceSeries(result: Awaited<ReturnType<typeof getHRAtPace>>): LineSeries | null {
  if (!result.ok) return null;
  const data = result.data
    .filter((row) => row.avg_hr !== null && Number.isFinite(row.avg_hr))
    .map((row) => [row.start_ts, row.avg_hr ?? 0] as [string, number]);
  return data.length === 0 ? null : { name: "HR @ 9:00/km", color: "#D8FF3D", data };
}

function isSeries(series: LineSeries | null): series is LineSeries {
  return series !== null;
}

function hasRows<T>(result: FetchResult<T[]>): boolean {
  return result.ok && result.data.length > 0;
}

function hasPaceRows(result: Awaited<ReturnType<typeof getHRAtPace>>): boolean {
  return result.ok && result.data.some((row) => row.avg_hr !== null);
}

function latestMetric<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  formatter: (value: number) => string,
): string {
  if (!result.ok || result.data.length === 0) return EMPTY_VALUE;
  const latest = result.data[result.data.length - 1];
  const value = latest?.[key];
  return typeof value === "number" && Number.isFinite(value) ? formatter(value) : EMPTY_VALUE;
}

function trendText<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  suffix: string,
): string {
  const delta = numericDelta(result, key);
  if (delta === null) return "Trend unavailable";
  return `${formatSigned(delta)} ${suffix}`;
}

function numericDelta<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
): number | null {
  if (!result.ok || result.data.length < 2) return null;
  const firstValue = result.data[0]?.[key];
  const lastValue = result.data[result.data.length - 1]?.[key];
  if (
    typeof firstValue !== "number" ||
    typeof lastValue !== "number" ||
    !Number.isFinite(firstValue) ||
    !Number.isFinite(lastValue)
  ) {
    return null;
  }
  return lastValue - firstValue;
}

function runMetricSummary(
  rows: PerformanceRunRow[],
  name: string,
  color: string,
  value: (row: PerformanceRunRow) => number | null,
): { avg: number | null; count: number; series: LineSeries[] } {
  const data: Array<[string, number]> = [];
  const values: number[] = [];
  for (const row of chronologicalRows(rows)) {
    const metric = value(row);
    if (metric !== null && Number.isFinite(metric)) {
      values.push(metric);
      data.push([row.workout.start_ts, metric]);
    }
  }
  return {
    avg: values.length === 0 ? null : average(values),
    count: values.length,
    series: data.length === 0 ? [] : [{ name, color, data }],
  };
}

function chronologicalRows(rows: PerformanceRunRow[]): PerformanceRunRow[] {
  return [...rows].sort(
    (left, right) => Date.parse(left.workout.start_ts) - Date.parse(right.workout.start_ts),
  );
}

function formatRunMetricCoverage(count: number): string {
  if (count === 0) return "No qualifying runs";
  if (count === 1) return "1 qualifying run";
  return `${count} qualifying runs`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? EMPTY_VALUE : formatPercentValue(value, 1);
}

function formatNullableNumber(value: number | null, fractionDigits: number): string {
  return value === null ? EMPTY_VALUE : formatNumber(value, fractionDigits);
}

function thresholdTone(
  value: number | null,
  threshold: number,
  highTone: Tone,
  lowTone: Tone,
): Tone {
  return value !== null && value > threshold ? highTone : lowTone;
}

function sumLoad(rows: LoadRow[]): number {
  return rows.reduce((sum, row) => sum + (row.load ?? 0), 0);
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
  if (stat === null) return EMPTY_VALUE;
  const value = stat[field];
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  if (type === "HKQuantityTypeIdentifierHeartRate") return `${formatNumber(value, 0)} bpm`;
  if (type === "HKQuantityTypeIdentifierRunningPower") return `${formatNumber(value, 0)} W`;
  if (type === "HKQuantityTypeIdentifierDistanceWalkingRunning") {
    return stat.unit === "km"
      ? `${formatNumber(value, 2)} km`
      : `${formatNumber(value, 1)} ${stat.unit ?? ""}`.trim();
  }
  return stat.unit === null ? formatNumber(value, 1) : `${formatNumber(value, 1)} ${stat.unit}`;
}

function classifyRun(row: PerformanceRunRow): string {
  const duration = row.workout.duration_sec;
  const drift = row.detail.ok ? row.detail.data.drift_pct : null;
  const z2 = row.detail.ok ? row.detail.data.z2_ratio : null;
  const avgHr = statNumber(row, "HKQuantityTypeIdentifierHeartRate", "average");
  if (drift !== null && drift > 10) return "Threshold Intervals";
  if (duration >= 5400) return "Long Run";
  if (z2 !== null && z2 >= 0.5) return "Zone 2 Run";
  if (avgHr !== null && avgHr >= 150) return "Tempo Run";
  return "Easy Run";
}

function statNumber(row: PerformanceRunRow, type: string, field: "average" | "sum"): number | null {
  const stat = getStat(row, type);
  const value = stat?.[field] ?? null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function loadClass(load: number | null): string {
  if (load === null) return "No data";
  if (load >= 350_000) return "High";
  if (load >= 180_000) return "Medium";
  return "Low";
}

function actionTone(kind: CompositeResult["action"]["kind"]): Tone {
  if (kind === "reduce_intensity" || kind === "run_easier") return "danger";
  if (kind === "add_sleep" || kind === "retest" || kind === "watch") return "warning";
  if (kind === "push") return "success";
  return "neutral";
}

function tagTone(confidence: CompositeResult["confidence"]): Tone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  return "danger";
}

function sampleLabel(sampleQuality: CompositeResult["sample_quality"]): string {
  if (sampleQuality === "high") return "high sample";
  if (sampleQuality === "mixed") return "mixed sample";
  return "poor sample";
}

function insightAccent(index: number): Accent {
  const accents: Accent[] = ["lime", "chlorophyll", "amber", "coral"];
  return accents[index] ?? "lime";
}

function generatedVisualValues(index: number): number[] {
  const values = [
    [31, 29, 35, 33, 39, 36, 38, 34, 35, 32, 31, 33, 32, 31],
    [12, 22, 28, 34, 38, 20, 16, 28, 30, 36, 42, 39, 44, 41],
    [24, 32, 28, 25, 24, 22, 23, 21, 20, 17, 18, 19, 30, 28],
    [10, 22, 15, 26, 12, 30, 18, 8, 35, 20, 28, 32, 18, 24],
  ];
  return values[index] ?? values[0] ?? [];
}

function sparklinePoints(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 60 : (index / (values.length - 1)) * 118 + 1;
      const y = 39 - ((value - min) / span) * 34;
      return `${formatNumber(x, 2)},${formatNumber(y, 2)}`;
    })
    .join(" ");
}

function barStyle(value: number): CSSProperties {
  const height = Math.max(10, Math.min(100, value * 100));
  return { "--bar-height": `${height}%` } as CSSProperties;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}`;
}

function formatDateShort(isoDate: string): string {
  return formatIsoDate(isoDate).replace(/, \d{4}$/, "");
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
