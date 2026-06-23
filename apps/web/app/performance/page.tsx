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
  formatPercent,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import {
  type Accent,
  type BenchmarkRow,
  type DashboardModel,
  type GuidanceModel,
  type InsightCardModel,
  type MetricSparklineModel,
  type Tone,
  barStyle,
  buildDashboardModel,
  formatNullableNumber,
  formatNullablePercent,
  formatRunMetricCoverage,
  hasPaceRows,
  hasRows,
  hrAtPaceSeries,
  isSeries,
  lineSeries,
  sparklinePoints,
  thresholdTone,
} from "@/lib/performance-dashboard";
import { zone2Status } from "@/lib/performance-zones";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Performance | Vital",
  description:
    "Endurance analytics across aerobic fitness, recovery, run economy, load, and workout context.",
};

export const dynamic = "force-dynamic";

const CHART_WINDOW_DAYS = 90;
const RUN_LIMIT = 14;
const EMPTY_VALUE = "—";

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

  const dashboard = buildDashboardModel({
    chartWindowDays: CHART_WINDOW_DAYS,
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
    performanceRunsResult,
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
  const z2 = zone2Status(zoneShare.z2Ratio);

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
        <span className={z2.tone === "neutral" ? "tag" : `tag ${z2.tone}`}>{z2.label}</span>
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
