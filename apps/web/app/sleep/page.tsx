import { ErrorBanner } from "@/components/ErrorBanner";
import { LineChart } from "@/components/charts/LineChart";
import { StackedBar } from "@/components/charts/StackedBar";
import { getSleepNights, getSleepSegments } from "@/lib/api";
import {
  chartDataKey,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatTimeOfDay,
  todayIso,
  windowStartIso,
} from "@/lib/format";
import type { SleepNightDetail, SleepSegment } from "@vitals/core";
import Link from "next/link";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [7, 14, 30, 90] as const;

const STAGE_COLORS = {
  core: "#60a5fa",
  deep: "#4ade80",
  rem: "#f472b6",
  unspecified: "#fbbf24",
} as const;

const SEGMENT_COLORS = {
  in_bed: "rgba(148, 163, 184, 0.55)",
  awake: "#f87171",
  core: STAGE_COLORS.core,
  deep: STAGE_COLORS.deep,
  rem: STAGE_COLORS.rem,
  unspecified: STAGE_COLORS.unspecified,
  asleep: "#60a5fa",
} as const;

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

function hasStageDetail(night: SleepNightDetail): boolean {
  return (
    night.core_hours !== null ||
    night.deep_hours !== null ||
    night.rem_hours !== null ||
    night.unspecified_hours !== null
  );
}

function sleepLabel(segment: SleepSegment): string {
  switch (segment.stage) {
    case "core":
      return "Core";
    case "deep":
      return "Deep";
    case "rem":
      return "REM";
    case "unspecified":
      return "Unspecified";
    default:
      switch (segment.state) {
        case "in_bed":
          return "In bed";
        case "awake":
          return "Awake";
        default:
          return "Asleep";
      }
  }
}

function sleepColor(segment: SleepSegment): string {
  const key = (segment.stage ?? segment.state) as keyof typeof SEGMENT_COLORS;
  return SEGMENT_COLORS[key] ?? SEGMENT_COLORS.asleep;
}

function averageEfficiency(nights: SleepNightDetail[]): number | null {
  const values = nights
    .map((night) => night.efficiency)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default async function SleepPage({
  searchParams,
}: SleepPageProps): Promise<React.ReactElement> {
  const raw = await searchParams;
  const days = parseWindowDays(firstValue(raw.days));
  const requestedNight = firstValue(raw.night);
  const to = todayIso();
  const from = windowStartIso(days);

  const [nightsResult, segmentsResult] = await Promise.all([
    getSleepNights({ from, to }),
    getSleepSegments({ from, to }),
  ]);

  return (
    <div>
      <h2 className="page-title">Sleep</h2>
      <p className="page-subtitle">
        Night-by-night detail for {from} to {to}. The dashboard card stays compact; this page is for
        drill-down, stage totals, and the segment timeline.
      </p>

      <div className="segmented-control">
        {WINDOW_OPTIONS.map((option) => (
          <Link
            key={option}
            href={sleepHref(option, requestedNight)}
            className={option === days ? "active" : undefined}
          >
            Last {option} days
          </Link>
        ))}
      </div>

      {!nightsResult.ok ? (
        <ErrorBanner title="Could not load sleep nights" detail={nightsResult.message} />
      ) : nightsResult.data.length === 0 ? (
        <div className="empty-state">No sleep rows were found in this window.</div>
      ) : (
        <SleepPageContent
          days={days}
          nights={nightsResult.data}
          requestedNight={requestedNight}
          segmentsResult={segmentsResult}
        />
      )}
    </div>
  );
}

function SleepPageContent({
  days,
  nights,
  requestedNight,
  segmentsResult,
}: {
  days: number;
  nights: SleepNightDetail[];
  requestedNight: string | undefined;
  segmentsResult: Awaited<ReturnType<typeof getSleepSegments>>;
}): React.ReactElement {
  const selectedNight =
    nights.find((night) => night.day === requestedNight) ?? nights[nights.length - 1];
  const selectedNightKey = selectedNight?.day ?? "";
  const selectedSegments =
    segmentsResult.ok && selectedNight !== undefined
      ? segmentsResult.data.filter((segment) => segment.night === selectedNight.day)
      : [];
  const totalAsleepHours = nights.reduce((sum, night) => sum + night.asleep_hours, 0);
  const avgAsleepHours = totalAsleepHours / nights.length;
  const efficiency = averageEfficiency(nights);
  const stageCoverageCount = nights.filter(hasStageDetail).length;

  const trendSeries = [
    {
      name: "Asleep",
      color: "#60a5fa",
      data: nights.map(
        (night) => [`${night.day}T00:00:00Z`, night.asleep_hours] as [string, number],
      ),
    },
    {
      name: "In bed",
      color: "#94a3b8",
      data: nights.map(
        (night) => [`${night.day}T00:00:00Z`, night.in_bed_hours] as [string, number],
      ),
    },
  ];

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <SummaryCard
          label="Nights"
          value={String(nights.length)}
          sub={`Window size ${days} days`}
        />
        <SummaryCard
          label="Total asleep"
          value={`${formatNumber(totalAsleepHours, 1)} h`}
          sub={`Average ${formatNumber(avgAsleepHours, 1)} h/night`}
        />
        <SummaryCard
          label="Average efficiency"
          value={efficiency === null ? "—" : formatPercent(efficiency, 0)}
          sub="Asleep hours divided by in-bed hours"
        />
        <SummaryCard
          label="Stage coverage"
          value={`${stageCoverageCount}/${nights.length}`}
          sub={
            stageCoverageCount === nights.length
              ? "All nights include preserved stage detail"
              : "Some nights predate raw stage preservation"
          }
        />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2>Nightly trend</h2>
          <LineChart
            key={chartDataKey("sleep-nights-trend", trendSeries)}
            series={trendSeries}
            yAxisLabel="hours"
            height={280}
          />
        </div>

        <div className="card">
          <h2>Nights</h2>
          <div className="sleep-night-list">
            {nights.map((night) => (
              <Link
                key={night.day}
                href={sleepHref(days, night.day)}
                className={`sleep-night-link ${night.day === selectedNightKey ? "active" : ""}`.trim()}
              >
                <div className="sleep-night-title">
                  <span>{formatIsoDate(night.day)}</span>
                  <span>{formatNumber(night.asleep_hours, 1)} h asleep</span>
                </div>
                <div className="sleep-night-meta">
                  {formatTimeOfDay(night.bedtime)} to {formatTimeOfDay(night.wake_time)} UTC ·
                  Efficiency{" "}
                  {night.efficiency === null ? " —" : ` ${formatPercent(night.efficiency, 0)}`}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {selectedNight === undefined ? null : (
        <div className="grid cols-2">
          <div className="card">
            <h2>Selected night</h2>
            <div className="sleep-detail-header">
              <div>
                <div className="stat-value">{formatIsoDate(selectedNight.day)}</div>
                <p>
                  Bedtime {formatTimeOfDay(selectedNight.bedtime)} UTC · Wake{" "}
                  {formatTimeOfDay(selectedNight.wake_time)} UTC
                </p>
              </div>
              <div className="tag">{formatNumber(selectedNight.awake_hours, 1)} h awake</div>
            </div>

            {segmentsResult.ok ? (
              <SleepTimeline segments={selectedSegments} />
            ) : (
              <ErrorBanner title="Could not load sleep segments" detail={segmentsResult.message} />
            )}

            {!hasStageDetail(selectedNight) ? (
              <div className="sleep-note">
                Stage totals are unavailable for this night because the stored rows predate `0.8.0`
                raw-stage preservation. Run `bun run health rebuild` after upgrading to backfill
                REM/Core/Deep detail from the source export.
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2>Stage breakdown</h2>
            {hasStageDetail(selectedNight) ? (
              <SleepStageBreakdown night={selectedNight} />
            ) : (
              <div className="empty-state">No preserved stage totals for this night.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}): React.ReactElement {
  return (
    <div className="card">
      <h2>{label}</h2>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function SleepTimeline({ segments }: { segments: SleepSegment[] }): React.ReactElement {
  if (segments.length === 0) {
    return <div className="empty-state">No timeline segments were returned for this night.</div>;
  }

  return (
    <>
      <div className="sleep-timeline">
        {segments.map((segment) => (
          <div
            key={`${segment.start_ts}-${segment.end_ts}-${segment.raw_state ?? segment.state}`}
            className="sleep-segment"
            style={{
              flexGrow: Math.max(segment.duration_hours, 0.15),
              background: sleepColor(segment),
            }}
            title={`${sleepLabel(segment)} · ${formatNumber(segment.duration_hours, 1)} h`}
          />
        ))}
      </div>

      <div className="sleep-legend">
        {segments.map((segment) => (
          <div
            key={`legend-${segment.start_ts}-${segment.end_ts}-${segment.raw_state ?? segment.state}`}
            className="sleep-legend-item"
          >
            <span className="sleep-swatch" style={{ background: sleepColor(segment) }} />
            <span>
              {sleepLabel(segment)} · {formatTimeOfDay(segment.start_ts)} to{" "}
              {formatTimeOfDay(segment.end_ts)} UTC
            </span>
          </div>
        ))}
      </div>

      <table className="workouts-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr
              key={`row-${segment.start_ts}-${segment.end_ts}-${segment.raw_state ?? segment.state}`}
            >
              <td>{sleepLabel(segment)}</td>
              <td>{formatTimeOfDay(segment.start_ts)} UTC</td>
              <td>{formatTimeOfDay(segment.end_ts)} UTC</td>
              <td>{formatNumber(segment.duration_hours, 1)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SleepStageBreakdown({ night }: { night: SleepNightDetail }): React.ReactElement {
  const stageSeries = [
    {
      name: "Core",
      color: STAGE_COLORS.core,
      data: [night.core_hours ?? 0],
    },
    {
      name: "Deep",
      color: STAGE_COLORS.deep,
      data: [night.deep_hours ?? 0],
    },
    {
      name: "REM",
      color: STAGE_COLORS.rem,
      data: [night.rem_hours ?? 0],
    },
    {
      name: "Unspecified",
      color: STAGE_COLORS.unspecified,
      data: [night.unspecified_hours ?? 0],
    },
  ];

  return (
    <>
      <StackedBar
        key={chartDataKey("sleep-stage-breakdown", stageSeries)}
        categories={[formatIsoDate(night.day)]}
        series={stageSeries}
        yAxisLabel="hours"
        height={260}
      />
      <div className="sleep-note">
        Stage totals use the additive `sleep.raw_state` column introduced in `0.8.0`. Older rows can
        still render the normalized timeline, but they will not show REM/Core/Deep totals until the
        source export is rebuilt.
      </div>
    </>
  );
}
