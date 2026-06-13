import { CardTitle } from "@/components/CardTitle";
import { ErrorBanner } from "@/components/ErrorBanner";
import { DonutChart } from "@/components/charts/DonutChart";
import { LineChart, type LineSeries } from "@/components/charts/LineChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { getSleepNights, getSleepSegments } from "@/lib/api";
import {
  chartDataKey,
  formatIsoDate,
  formatLocalTimeOfDay,
  formatPercent,
  localTimeZoneLabel,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import {
  type SleepDelta,
  type SleepInsight,
  type SleepLaneSegment,
  type SleepStageBreakdownItem,
  buildLaneSegments,
  buildSleepDashboardModel,
  buildSleepInsights,
  countAwakeningsForNight,
  stageBreakdownForNight,
} from "@/lib/sleep-dashboard";
import type { SleepNightDetail, SleepSegment } from "@vitals/core";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Sleep | Vital",
  description:
    "Sleep duration, efficiency, consistency, stage balance, and night architecture insights.",
};

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;

const STAGE_COLORS = {
  deep: "#8F5DFF",
  core: "#2FA7FF",
  rem: "#E0529C",
  awake: "#F5A524",
  unspecified: "#8A9790",
  asleep: "#5FD3F3",
} as const;

const SLEEP_LANES: Array<{ key: SleepLaneSegment["lane"]; label: string }> = [
  { key: "awake", label: "Awake" },
  { key: "rem", label: "REM" },
  { key: "core", label: "Core" },
  { key: "deep", label: "Deep" },
];

interface SleepPageProps {
  searchParams: Promise<{
    days?: string | string[];
    night?: string | string[];
  }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseWindowDays(value: string | undefined): (typeof WINDOW_OPTIONS)[number] {
  const parsed = Number(value);
  return WINDOW_OPTIONS.find((option) => option === parsed) ?? 30;
}

function sleepHref(days: number, night?: string): string {
  const params = new URLSearchParams({ days: String(days) });
  if (night !== undefined && night !== "") {
    params.set("night", night);
  }
  return `/sleep?${params.toString()}`;
}

export default async function SleepPage({
  searchParams,
}: SleepPageProps): Promise<React.ReactElement> {
  const raw = await searchParams;
  const days = parseWindowDays(firstValue(raw.days));
  const requestedNight = firstValue(raw.night);
  const to = todayIso();
  const from = windowStartIso(days);
  const priorTo = addIsoDays(from, -1);
  const priorFrom = addIsoDays(from, -days);

  const [nightsResult, segmentsResult, priorNightsResult, priorSegmentsResult] = await Promise.all([
    getSleepNights({ from, to }),
    getSleepSegments({ from, to }),
    getSleepNights({ from: priorFrom, to: priorTo }),
    getSleepSegments({ from: priorFrom, to: priorTo }),
  ]);

  return (
    <div className="sleep-dashboard">
      <SleepHeader from={from} to={to} days={days} requestedNight={requestedNight} />

      {!nightsResult.ok ? (
        <ErrorBanner title="Could not load sleep nights" detail={nightsResult.message} />
      ) : nightsResult.data.length === 0 ? (
        <div className="empty-state">No sleep rows were found in this window.</div>
      ) : (
        <SleepPageContent
          days={days}
          nights={nightsResult.data}
          requestedNight={requestedNight}
          segments={segmentsResult.ok ? segmentsResult.data : []}
          segmentsError={segmentsResult.ok ? null : segmentsResult.message}
          priorNights={priorNightsResult.ok ? priorNightsResult.data : []}
          priorSegments={priorSegmentsResult.ok ? priorSegmentsResult.data : []}
        />
      )}

      <footer className="sleep-time-footer">
        <LockIcon />
        <span>All times shown in your local time ({localTimeZoneLabel()})</span>
      </footer>
    </div>
  );
}

function SleepHeader({
  from,
  to,
  days,
  requestedNight,
}: {
  from: string;
  to: string;
  days: number;
  requestedNight: string | undefined;
}): React.ReactElement {
  return (
    <header className="sleep-header">
      <div className="sleep-heading">
        <div className="kicker">
          <span>Recovery</span>
          <span>·</span>
          <span>Night architecture</span>
        </div>
        <h2 className="page-title">
          The hours you <em>actually</em> slept.
        </h2>
        <p className="page-subtitle">
          Your nightly sleep, consistency, stage balance, and recent changes, so you can recover
          better and perform at your best.
        </p>
      </div>
      <div className="sleep-header-tools">
        <div className="sleep-date-pill" aria-label={`Date range ${from} to ${to}`}>
          <CalendarIcon />
          <span>
            {formatIsoDate(from)} - {formatIsoDate(to)}
          </span>
          <ChevronDownIcon />
        </div>
        <nav className="segmented-control sleep-window-control" aria-label="Sleep window">
          {WINDOW_OPTIONS.map((option) => (
            <Link
              key={option}
              href={sleepHref(option, requestedNight)}
              className={option === days ? "active" : undefined}
              aria-current={option === days ? "page" : undefined}
            >
              Last {option} days
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function SleepPageContent({
  days,
  nights,
  requestedNight,
  segments,
  segmentsError,
  priorNights,
  priorSegments,
}: {
  days: number;
  nights: SleepNightDetail[];
  requestedNight: string | undefined;
  segments: SleepSegment[];
  segmentsError: string | null;
  priorNights: SleepNightDetail[];
  priorSegments: SleepSegment[];
}): React.ReactElement {
  const nightsNewestFirst = nights.toSorted((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const nightsChronological = [...nightsNewestFirst].reverse();
  const selectedNight =
    nightsNewestFirst.find((night) => night.day === requestedNight) ?? nightsNewestFirst[0];
  const selectedSegments =
    selectedNight === undefined
      ? []
      : segments.filter((segment) => segment.night === selectedNight.day);
  const model = buildSleepDashboardModel({
    currentNights: nightsNewestFirst,
    currentSegments: segments,
    priorNights,
    priorSegments,
  });
  const insights = buildSleepInsights(model.current, model.comparisons);

  return (
    <>
      <section className="sleep-metric-grid" aria-label="Sleep summary metrics">
        <SleepMetricCard
          icon={<DiamondIcon />}
          label="Nights tracked"
          value={String(model.current.nightsTracked)}
          unit="nights"
          delta={model.comparisons.nightsTracked}
          deltaKind="count"
          days={days}
          sparklineValues={nightsChronological.map((night) => night.asleep_hours)}
          color="#D8FF3D"
          tip="Number of sleep nights analyzed in this window."
        />
        <SleepMetricCard
          icon={<ClockIcon />}
          label="Avg sleep duration"
          value={formatHours(model.current.averageAsleepHours)}
          delta={model.comparisons.averageAsleepHours}
          deltaKind="hours"
          days={days}
          sparklineValues={nightsChronological.map((night) => night.asleep_hours)}
          color="#BFA6FF"
          tip="Average hours classified as asleep per tracked night."
        />
        <SleepMetricCard
          icon={<WaveIcon />}
          label="Sleep efficiency"
          value={
            model.current.averageEfficiency === null
              ? "-"
              : formatPercent(model.current.averageEfficiency, 0)
          }
          delta={model.comparisons.averageEfficiency}
          deltaKind="percent"
          days={days}
          sparklineValues={nightsChronological.flatMap((night) =>
            night.efficiency === null ? [] : [night.efficiency],
          )}
          color="#5FD3F3"
          tip="Average asleep hours divided by time in bed. 85% or higher is a useful benchmark."
        />
        <SleepMetricCard
          icon={<StarIcon />}
          label="Sleep score"
          value={String(model.current.score.value)}
          unit="/ 100"
          delta={model.comparisons.sleepScore}
          deltaKind="count"
          days={days}
          sparklineValues={nightsChronological.map(
            (night) =>
              buildSleepDashboardModel({
                currentNights: [night],
                currentSegments: segments.filter((segment) => segment.night === night.day),
                priorNights: [],
                priorSegments: [],
              }).current.score.value,
          )}
          color="#F5A524"
          tip="App score based on duration, efficiency, consistency, awakenings, and stage balance."
        />
      </section>

      <section className="sleep-main-grid" aria-label="Sleep trends and quality">
        <SleepTrendPanel days={days} nights={nightsChronological} model={model} />
        <SleepScorePanel model={model} />
      </section>

      {selectedNight === undefined ? null : (
        <section className="sleep-selected-grid" aria-label="Selected sleep night">
          <SelectedNightPanel
            night={selectedNight}
            segments={selectedSegments}
            segmentsError={segmentsError}
          />
          <StageBreakdownPanel night={selectedNight} />
        </section>
      )}

      <section className="sleep-lower-grid" aria-label="Recent sleep and consistency">
        <RecentNightsTable
          days={days}
          nights={nightsNewestFirst.slice(0, 8)}
          selectedNight={selectedNight}
        />
        <SleepConsistencyPanel nights={nightsChronological} model={model} />
      </section>

      <section className="sleep-insight-grid" aria-label="Sleep insights">
        {insights.map((insight) => (
          <SleepInsightCard key={insight.key} insight={insight} />
        ))}
      </section>
    </>
  );
}

function SleepMetricCard({
  icon,
  label,
  value,
  unit,
  delta,
  deltaKind,
  days,
  sparklineValues,
  color,
  tip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta: SleepDelta;
  deltaKind: "count" | "hours" | "percent";
  days: number;
  sparklineValues: number[];
  color: string;
  tip: string;
}): React.ReactElement {
  return (
    <div className="card sleep-metric-card">
      <div className="sleep-metric-title-row">
        <span className="sleep-metric-icon" style={{ "--metric-color": color } as CSSProperties}>
          {icon}
        </span>
        <CardTitle title={label} tip={tip} />
      </div>
      <div className="sleep-metric-value">
        <strong>{value}</strong>
        {unit === undefined ? null : <span>{unit}</span>}
      </div>
      <div className="sleep-metric-delta">
        <span>vs prior {days} days</span>
        <em className={deltaClass(delta)}>{formatDelta(delta, deltaKind)}</em>
      </div>
      <Sparkline values={sparklineValues} color={color} />
    </div>
  );
}

function SleepTrendPanel({
  days,
  nights,
  model,
}: {
  days: number;
  nights: SleepNightDetail[];
  model: ReturnType<typeof buildSleepDashboardModel>;
}): React.ReactElement {
  const trendSeries: LineSeries[] = [
    {
      name: "Time in bed",
      color: "#8A9790",
      lineType: "dashed",
      lineWidth: 1.5,
      smooth: true,
      data: nights.map((night) => [`${night.day}T00:00:00Z`, night.in_bed_hours]),
    },
    {
      name: "Sleep duration",
      color: "#A68CFF",
      area: true,
      lineWidth: 2.4,
      smooth: true,
      data: nights.map((night) => [`${night.day}T00:00:00Z`, night.asleep_hours]),
    },
  ];
  const bestNight = model.current.bestNight;

  return (
    <div className="card sleep-trend-card">
      <div className="panel-title-row">
        <div>
          <CardTitle
            title="Sleep trends"
            tip="Per-night time in bed and sleep duration across the selected window."
          />
          <p>Over the past {days} days</p>
        </div>
      </div>
      <LineChart
        key={chartDataKey("sleep-trends", trendSeries)}
        series={trendSeries}
        yAxisLabel="Hours"
        height={330}
      />
      <div className="sleep-trend-summary">
        <div className="sleep-summary-orb">
          <MoonGlyph />
        </div>
        <p>
          You averaged <strong>{formatHours(model.current.averageAsleepHours)}</strong> of sleep,
          spending <strong>{formatHours(model.current.averageInBedHours)}</strong> in bed.
          Efficiency is{" "}
          <strong>
            {model.current.averageEfficiency === null
              ? "unknown"
              : formatPercent(model.current.averageEfficiency, 0)}
          </strong>{" "}
          compared to your prior {days} days.
        </p>
        <div className="sleep-best-night">
          <span>Best night</span>
          <strong>{bestNight === null ? "No data" : formatIsoDate(bestNight.day)}</strong>
          <em>
            {bestNight === null
              ? "Track more nights"
              : `${formatHours(bestNight.asleep_hours)} - ${
                  bestNight.efficiency === null ? "unknown" : formatPercent(bestNight.efficiency, 0)
                } efficiency`}
          </em>
        </div>
      </div>
    </div>
  );
}

function SleepScorePanel({
  model,
}: {
  model: ReturnType<typeof buildSleepDashboardModel>;
}): React.ReactElement {
  const score = model.current.score;
  return (
    <div className="card sleep-score-card">
      <CardTitle
        title="Sleep quality summary"
        tip="A dashboard heuristic, not a clinical score. It combines duration, efficiency, consistency, awakenings, and stage balance."
      />
      <div className="sleep-score-ring" style={{ "--score": `${score.value}%` } as CSSProperties}>
        <strong>{score.value}</strong>
        <span>Sleep score</span>
        <em>{score.label}</em>
      </div>
      <p>{score.summary}</p>
      <div className="sleep-guidance-list">
        <span>What can improve your score</span>
        {score.guidance.map((item) => (
          <div key={item.key} className="sleep-guidance-item">
            <span>{item.label.slice(0, 2)}</span>
            <p>
              <strong>{item.label}</strong>
              {item.guidance}
            </p>
          </div>
        ))}
      </div>
      <button type="button" className="sleep-score-action">
        <span>View score details</span>
        <ChevronRightIcon />
      </button>
    </div>
  );
}

function SelectedNightPanel({
  night,
  segments,
  segmentsError,
}: {
  night: SleepNightDetail;
  segments: SleepSegment[];
  segmentsError: string | null;
}): React.ReactElement {
  const laneSegments = buildLaneSegments(night, segments);
  return (
    <div className="card sleep-selected-card">
      <div className="sleep-selected-head">
        <CardTitle
          title={
            <>
              Selected night <span>{formatIsoDate(night.day)}</span>
            </>
          }
          tip="Timeline from bed through sleep stages and awake periods."
        />
        <span className="range-pill">Latest night</span>
      </div>
      <div className="sleep-selected-stats">
        <SmallStat label="Bedtime" value={formatLocalTimeOfDay(night.bedtime)} />
        <SmallStat label="Wake time" value={formatLocalTimeOfDay(night.wake_time)} />
        <SmallStat label="Time asleep" value={formatHours(night.asleep_hours)} />
        <SmallStat
          label="Sleep efficiency"
          value={night.efficiency === null ? "-" : formatPercent(night.efficiency, 0)}
        />
        <SmallStat label="Awakenings" value={String(countAwakeningsForNight(segments))} />
      </div>
      {segmentsError === null ? (
        <SleepLaneTimeline night={night} laneSegments={laneSegments} />
      ) : (
        <ErrorBanner title="Could not load sleep segments" detail={segmentsError} />
      )}
      {stageBreakdownForNight(night).some((item) => item.key === "asleep") ? (
        <div className="sleep-note">
          Stage totals are unavailable for this night, so the dashboard falls back to asleep and
          awake totals.
        </div>
      ) : null}
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="sleep-small-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SleepLaneTimeline({
  night,
  laneSegments,
}: {
  night: SleepNightDetail;
  laneSegments: SleepLaneSegment[];
}): React.ReactElement {
  if (laneSegments.length === 0) {
    return <div className="empty-state">No stage lane segments were returned for this night.</div>;
  }

  return (
    <div className="sleep-stage-lanes">
      {SLEEP_LANES.map((lane) => (
        <div key={lane.key} className="sleep-stage-lane">
          <span>{lane.label}</span>
          <div className="sleep-stage-track">
            {laneSegments.map((segment) =>
              segment.lane === lane.key ? (
                <span
                  key={`${segment.startTs}-${segment.endTs}-${segment.lane}`}
                  className={`sleep-stage-segment ${segment.lane}`}
                  style={{
                    left: `${segment.startPercent}%`,
                    width: `${segment.widthPercent}%`,
                  }}
                  title={`${segment.label}: ${formatLocalTimeOfDay(
                    segment.startTs,
                  )} to ${formatLocalTimeOfDay(segment.endTs)}`}
                />
              ) : null,
            )}
          </div>
        </div>
      ))}
      <div className="sleep-timeline-axis">
        <span>{formatLocalTimeOfDay(night.bedtime)}</span>
        <span>{formatLocalTimeOfDay(midpointIso(night.bedtime, night.wake_time))}</span>
        <span>{formatLocalTimeOfDay(night.wake_time)}</span>
      </div>
      <StageLegend />
    </div>
  );
}

function StageBreakdownPanel({ night }: { night: SleepNightDetail }): React.ReactElement {
  const breakdown = stageBreakdownForNight(night);
  const chartData = breakdown.map((item) => ({
    name: item.label,
    value: item.hours,
    color: stageColor(item.key),
  }));
  return (
    <div className="card sleep-stage-donut-panel">
      <CardTitle
        title="Stage breakdown"
        tip="Selected-night stage totals. Older data may fall back to asleep and awake totals."
      />
      <div className="sleep-stage-donut-layout">
        <DonutChart
          key={chartDataKey("sleep-stage-donut", chartData)}
          data={chartData}
          centerValue={formatHours(night.asleep_hours)}
          centerLabel="Total asleep"
          height={250}
        />
        <div className="sleep-stage-breakdown-list">
          {breakdown.map((item) => (
            <div key={item.key}>
              <span className="sleep-swatch" style={{ background: stageColor(item.key) }} />
              <strong>{item.label}</strong>
              <em>{formatHours(item.hours)}</em>
              <span>{formatPercent(item.percent, 0)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sleep-stage-range">
        <span>Typical range</span>
        <span>Deep 15-25% · Core 45-65% · REM 15-25% · Awake 5-10%</span>
      </div>
    </div>
  );
}

function RecentNightsTable({
  days,
  nights,
  selectedNight,
}: {
  days: number;
  nights: SleepNightDetail[];
  selectedNight: SleepNightDetail | undefined;
}): React.ReactElement {
  return (
    <div className="card sleep-recent-card">
      <CardTitle
        title="Recent nights"
        tip="Click a night to update the selected-night dashboard."
      />
      <div className="sleep-recent-table-wrap">
        <table className="sleep-recent-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Sleep</th>
              <th>Time in bed</th>
              <th>Efficiency</th>
              <th>Stages</th>
              <th aria-label="Select" />
            </tr>
          </thead>
          <tbody>
            {nights.map((night) => (
              <tr key={night.day} className={night.day === selectedNight?.day ? "active" : ""}>
                <td>
                  <Link href={sleepHref(days, night.day)}>{formatShortIsoDate(night.day)}</Link>
                </td>
                <td>{formatHours(night.asleep_hours)}</td>
                <td>{formatHours(night.in_bed_hours)}</td>
                <td>{night.efficiency === null ? "-" : formatPercent(night.efficiency, 0)}</td>
                <td>
                  <StageStrip breakdown={stageBreakdownForNight(night)} />
                </td>
                <td>
                  <Link
                    href={sleepHref(days, night.day)}
                    className="sleep-row-affordance"
                    aria-label={`Select ${formatIsoDate(night.day)}`}
                  >
                    <ChevronRightIcon />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href={sleepHref(days)} className="sleep-history-link">
        <span>View full history</span>
        <ChevronRightIcon />
      </Link>
    </div>
  );
}

function SleepConsistencyPanel({
  nights,
  model,
}: {
  nights: SleepNightDetail[];
  model: ReturnType<typeof buildSleepDashboardModel>;
}): React.ReactElement {
  const rows = nights.slice(-7);
  return (
    <div className="card sleep-consistency-card">
      <CardTitle
        title="Sleep consistency"
        tip="Bedtime and wake-time positions by day. Tighter clustering usually means stronger rhythm consistency."
      />
      <p>Dots show your bedtime and wake time. The tighter the cluster, the more consistent.</p>
      <div className="sleep-consistency-chart">
        {rows.map((night) => (
          <div key={night.day} className="sleep-consistency-row">
            <span>{weekdayLabel(night.day)}</span>
            <div className="sleep-consistency-track">
              <i className="bedtime" style={{ left: `${timePosition(night.bedtime)}%` }} />
              <i className="wake" style={{ left: `${timePosition(night.wake_time)}%` }} />
            </div>
          </div>
        ))}
        <div className="sleep-consistency-axis">
          <span>8 PM</span>
          <span>12 AM</span>
          <span>4 AM</span>
          <span>8 AM</span>
          <span>10 AM</span>
        </div>
      </div>
      <div className="sleep-consistency-summary">
        <div>
          <span>Bedtime consistency</span>
          <strong>{formatMinutes(model.current.bedtimeVariationMinutes)}</strong>
          <em>typical variation</em>
        </div>
        <div>
          <span>Wake time consistency</span>
          <strong>{formatMinutes(model.current.wakeVariationMinutes)}</strong>
          <em>typical variation</em>
        </div>
      </div>
    </div>
  );
}

function SleepInsightCard({ insight }: { insight: SleepInsight }): React.ReactElement {
  return (
    <div className="card sleep-insight-card">
      <div className="sleep-insight-title">
        <span>{insightIcon(insight.key)}</span>
        <strong>{insight.label}</strong>
      </div>
      <div className="sleep-insight-value">{formatInsightValue(insight)}</div>
      {insight.delta === null ? null : (
        <div className="sleep-insight-delta">
          <span>vs last 30 days</span>
          <em className={deltaClass(insight.delta)}>
            {formatDelta(insight.delta, insight.key === "deepSleep" ? "hours" : "count")}
          </em>
        </div>
      )}
      <p>{insight.detail}</p>
    </div>
  );
}

function StageStrip({
  breakdown,
}: {
  breakdown: SleepStageBreakdownItem[];
}): React.ReactElement {
  return (
    <span className="sleep-stage-strip">
      {breakdown.map((item) => (
        <span
          key={item.key}
          style={{
            width: `${Math.max(item.percent * 100, 4)}%`,
            background: stageColor(item.key),
          }}
        />
      ))}
    </span>
  );
}

function StageLegend(): React.ReactElement {
  return (
    <div className="sleep-legend">
      {(["deep", "core", "rem", "awake"] as const).map((stage) => (
        <span key={stage}>
          <i style={{ background: stageColor(stage) }} />
          {stage === "rem" ? "REM" : titleCase(stage)}
        </span>
      ))}
    </div>
  );
}

function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDelta(delta: SleepDelta, kind: "count" | "hours" | "percent"): string {
  if (delta.value === null || delta.direction === "neutral") return "--";
  const prefix = delta.value > 0 ? "+" : "";
  if (kind === "hours") return `${prefix}${Math.round(delta.value * 60)}m`;
  if (kind === "percent") return `${prefix}${Math.round(delta.value * 100)}%`;
  return `${prefix}${Math.round(delta.value)}`;
}

function deltaClass(delta: SleepDelta): string {
  if (delta.isPositive === true) return "good";
  if (delta.isPositive === false) return "bad";
  return "neutral";
}

function formatMinutes(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)} min`;
}

function stageColor(stage: SleepStageBreakdownItem["key"]): string {
  return STAGE_COLORS[stage];
}

function midpointIso(startIso: string, endIso: string): string {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return new Date(start + (end - start) / 2).toISOString();
}

function weekdayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function formatShortIsoDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatInsightValue(insight: SleepInsight): string {
  if (insight.key === "bestNight" && /^\d{4}-\d{2}-\d{2}$/.test(insight.value)) {
    return formatIsoDate(insight.value);
  }
  return insight.value;
}

function timePosition(iso: string): number {
  const date = new Date(iso);
  let minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 12 * 60) minutes += 24 * 60;
  const min = 20 * 60;
  const max = 34 * 60;
  return Math.min(Math.max(((minutes - min) / (max - min)) * 100, 0), 100);
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function insightIcon(key: SleepInsight["key"]): string {
  switch (key) {
    case "bedtime":
      return "◷";
    case "awakenings":
      return "⌁";
    case "bestNight":
      return "★";
    case "deepSleep":
      return "◒";
  }
}

function CalendarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function LockIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />
    </svg>
  );
}

function DiamondIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 4 8 8-8 8-8-8Z" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function WaveIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 14c3 0 3-5 6-5s3 5 6 5 3-5 6-5" />
    </svg>
  );
}

function StarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
    </svg>
  );
}

function MoonGlyph(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 15.4A7.5 7.5 0 0 1 8.6 6a7.5 7.5 0 1 0 9.4 9.4Z" />
    </svg>
  );
}
