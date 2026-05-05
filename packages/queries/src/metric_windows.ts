import { type MetricWindowComparison, MetricWindowComparisonSchema } from "@vitals/core";
import type { Db, SqlValue } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type MetricGetter = (db: Db, range: DateRange, days: number) => Promise<number | null>;

interface MetricDefinition {
  metric: string;
  label: string;
  unit: string;
  getValue: MetricGetter;
}

const METRICS: MetricDefinition[] = [
  {
    metric: "resting_hr",
    label: "Resting HR",
    unit: "bpm",
    getValue: averageColumn("resting_hr", "bpm"),
  },
  { metric: "hrv", label: "HRV", unit: "ms", getValue: averageColumn("hrv", "value") },
  { metric: "sleep_hours", label: "Sleep", unit: "h/day", getValue: sleepHoursPerDay },
  {
    metric: "steps",
    label: "Steps",
    unit: "steps/day",
    getValue: sumColumnPerDay("steps", "count"),
  },
  {
    metric: "active_energy",
    label: "Active energy",
    unit: "kcal/day",
    getValue: sumColumnPerDay("energy", "active_kcal"),
  },
  {
    metric: "walking_hr",
    label: "Walking HR",
    unit: "bpm",
    getValue: averageColumn("walking_hr", "bpm"),
  },
  {
    metric: "vo2max",
    label: "VO2 Max",
    unit: "mL/kg/min",
    getValue: averageColumn("performance", "vo2max", "vo2max IS NOT NULL"),
  },
  {
    metric: "distance",
    label: "Distance",
    unit: "m/day",
    getValue: sumColumnPerDay("distance", "meters"),
  },
  {
    metric: "running_speed",
    label: "Running speed",
    unit: "m/s",
    getValue: averageColumn("performance", "speed", "speed IS NOT NULL"),
  },
  {
    metric: "running_power",
    label: "Running power",
    unit: "W",
    getValue: averageColumn("performance", "power", "power IS NOT NULL"),
  },
  {
    metric: "training_load",
    label: "Training load",
    unit: "load/day",
    getValue: trainingLoadPerDay,
  },
  {
    metric: "z2_minutes",
    label: "Z2 minutes",
    unit: "min/day",
    getValue: z2MinutesPerDay,
  },
];

export async function getMetricWindowComparisons(
  db: Db,
  toDateInput: string,
): Promise<MetricWindowComparison[]> {
  const toDate = normalizeToDateOnly(toDateInput);
  const windows = [
    { key: "today" as const, range: trailingRange(toDate, 1), days: 1 },
    { key: "avg_7d" as const, range: trailingRange(toDate, 7), days: 7 },
    { key: "avg_30d" as const, range: trailingRange(toDate, 30), days: 30 },
  ];

  return Promise.all(
    METRICS.map(async (definition) => {
      const values = Object.fromEntries(
        await Promise.all(
          windows.map(async (window) => [
            window.key,
            await definition.getValue(db, window.range, window.days),
          ]),
        ),
      ) as Pick<MetricWindowComparison, "today" | "avg_7d" | "avg_30d">;

      return MetricWindowComparisonSchema.parse({
        metric: definition.metric,
        label: definition.label,
        unit: definition.unit,
        today: values.today,
        avg_7d: values.avg_7d,
        avg_30d: values.avg_30d,
        delta_today_vs_7d: delta(values.today, values.avg_7d),
        delta_today_vs_30d: delta(values.today, values.avg_30d),
      });
    }),
  );
}

function averageColumn(table: string, column: string, extraWhere?: string): MetricGetter {
  return async (db, range) => {
    const bounds = rangeBounds(range);
    const extra = extraWhere === undefined ? "" : `AND ${extraWhere}`;
    return scalar(
      db,
      `SELECT AVG(${column})::DOUBLE AS value
       FROM ${table}
       WHERE ts >= ? AND ts ${bounds.operator} ? ${extra}`,
      [bounds.from, bounds.to],
    );
  };
}

function sumColumnPerDay(table: string, column: string): MetricGetter {
  return async (db, range, days) => {
    const bounds = rangeBounds(range);
    const value = await scalar(
      db,
      `SELECT SUM(${column})::DOUBLE / ? AS value
       FROM ${table}
       WHERE ${column} IS NOT NULL
         AND ts >= ?
         AND ts ${bounds.operator} ?`,
      [days, bounds.from, bounds.to],
    );
    return value;
  };
}

async function sleepHoursPerDay(db: Db, range: DateRange, days: number): Promise<number | null> {
  const bounds = rangeBounds(range);
  return scalar(
    db,
    `SELECT SUM(date_diff('second', start_ts, end_ts))::DOUBLE / 3600.0 / ? AS value
     FROM sleep
     WHERE state = 'asleep'
       AND start_ts >= ?
       AND start_ts ${bounds.operator} ?`,
    [days, bounds.from, bounds.to],
  );
}

async function trainingLoadPerDay(db: Db, range: DateRange, days: number): Promise<number | null> {
  const bounds = rangeBounds(range);
  return scalar(
    db,
    `WITH workout_load AS (
       SELECT
         CASE
           WHEN AVG(hr.bpm) IS NULL THEN NULL
           ELSE w.duration_sec * AVG(hr.bpm)
         END AS load
       FROM workouts w
       LEFT JOIN heart_rate hr
         ON hr.ts BETWEEN w.start_ts AND w.end_ts
       WHERE w.start_ts >= ? AND w.start_ts ${bounds.operator} ?
       GROUP BY w.id, w.duration_sec
     )
     SELECT SUM(load)::DOUBLE / ? AS value
     FROM workout_load`,
    [bounds.from, bounds.to, days],
  );
}

async function z2MinutesPerDay(db: Db, range: DateRange, days: number): Promise<number | null> {
  const bounds = rangeBounds(range);
  return scalar(
    db,
    `WITH scoped AS (
       SELECT
         w.id AS workout_id,
         w.end_ts AS workout_end_ts,
         hr.ts,
         hr.bpm,
         LEAD(hr.ts) OVER (
           PARTITION BY w.id
           ORDER BY hr.ts
         ) AS next_ts
       FROM workouts w
       JOIN heart_rate hr
         ON hr.ts BETWEEN w.start_ts AND w.end_ts
       WHERE w.start_ts >= ? AND w.start_ts ${bounds.operator} ?
     ),
     intervals AS (
       SELECT
         bpm,
         GREATEST(
           0,
           LEAST(
             EXTRACT(EPOCH FROM COALESCE(next_ts, workout_end_ts)) - EXTRACT(EPOCH FROM ts),
             120
           )
         ) AS duration_sec
       FROM scoped
     )
     SELECT
       SUM(CASE WHEN bpm BETWEEN 115 AND 125 THEN duration_sec ELSE 0 END)::DOUBLE / 60.0 / ? AS value
     FROM intervals`,
    [bounds.from, bounds.to, days],
  );
}

async function scalar(db: Db, sql: string, params: SqlValue[]): Promise<number | null> {
  const row = await db.get<{ value: number | null }>(sql, params);
  return row?.value ?? null;
}

function rangeBounds(range: DateRange): {
  from: string;
  operator: "<" | "<=";
  to: string;
} {
  const upper = normalizeRangeEnd(range.to);
  return {
    from: normalizeRangeStart(range.from),
    operator: upper.operator,
    to: upper.value,
  };
}

function trailingRange(toDate: string, days: number): DateRange {
  const to = new Date(`${toDate}T00:00:00.000Z`);
  const from = new Date(to.getTime() - (days - 1) * MS_PER_DAY);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function normalizeToDateOnly(input: string): string {
  const date = input.length === 10 ? new Date(`${input}T00:00:00.000Z`) : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date input: ${input}`);
  return date.toISOString().slice(0, 10);
}

function delta(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}
