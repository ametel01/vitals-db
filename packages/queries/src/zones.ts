import {
  HR_ZONES,
  HR_ZONE_ORDER,
  type WorkoutZoneBreakdownRow,
  WorkoutZoneBreakdownRowSchema,
  type ZoneTimeDistributionRow,
  ZoneTimeDistributionRowSchema,
  type ZonesRow,
  ZonesRowSchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

const MAX_ZONE_INTERVAL_SEC = 120;

// Spec §4.1. `getZones` / `getWorkoutZones` continue to return the canonical
// sample-based `z2_ratio` surface. 0.9.0 explicitly reuses that contract for
// "% of run spent in Z2" rather than inventing a second metric with different
// semantics right before 1.0.0.
const SQL_WORKOUT = `SELECT
                       CASE
                         WHEN COUNT(*) = 0 THEN NULL
                         ELSE COUNT(*) FILTER (WHERE hr.bpm BETWEEN ? AND ?) * 1.0 / COUNT(*)
                       END AS z2_ratio
                     FROM heart_rate hr
                     JOIN workouts w ON hr.ts BETWEEN w.start_ts AND w.end_ts
                     WHERE w.id = ?`;

export async function getZones(db: Db, range: DateRange): Promise<ZonesRow> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 CASE
                   WHEN COUNT(*) = 0 THEN NULL
                   ELSE COUNT(*) FILTER (WHERE bpm BETWEEN ? AND ?) * 1.0 / COUNT(*)
                 END AS z2_ratio
               FROM heart_rate
               WHERE ts >= ? AND ts ${upper.operator} ?`;
  const row = await db.get<{ z2_ratio: number | null }>(sql, [
    HR_ZONES.Z2.min,
    HR_ZONES.Z2.max,
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return ZonesRowSchema.parse({ z2_ratio: row === null ? null : row.z2_ratio });
}

export async function getWorkoutZones(db: Db, workoutId: string): Promise<ZonesRow> {
  const row = await db.get<{ z2_ratio: number | null }>(SQL_WORKOUT, [
    HR_ZONES.Z2.min,
    HR_ZONES.Z2.max,
    workoutId,
  ]);
  return ZonesRowSchema.parse({ z2_ratio: row === null ? null : row.z2_ratio });
}

// One row with N+1 INTEGER columns: `total` and one `<zone>_count` per zone.
// `::INTEGER` keeps DuckDB's COUNT(*) from deserializing as bigint. Zones are
// partitioned by contiguous integer bpm bounds from `HR_ZONES`, so every
// sample falls in exactly one zone and the counts sum to `total`.
const SQL_WORKOUT_BREAKDOWN = `SELECT
                                 COUNT(*)::INTEGER AS total,
                                 ${HR_ZONE_ORDER.map(
                                   (zone) =>
                                     `COUNT(*) FILTER (WHERE hr.bpm BETWEEN ${HR_ZONES[zone].min} AND ${HR_ZONES[zone].max})::INTEGER AS ${zone.toLowerCase()}_count`,
                                 ).join(",\n                                 ")}
                               FROM heart_rate hr
                               JOIN workouts w ON hr.ts BETWEEN w.start_ts AND w.end_ts
                               WHERE w.id = ?`;

type WorkoutBreakdownRow = { total: number } & Record<string, number>;

export async function getWorkoutZoneBreakdown(
  db: Db,
  workoutId: string,
): Promise<WorkoutZoneBreakdownRow[]> {
  const row = await db.get<WorkoutBreakdownRow>(SQL_WORKOUT_BREAKDOWN, [workoutId]);
  if (row === null) return [];
  const total = row.total;
  if (total === 0) return [];
  return HR_ZONE_ORDER.map((zone) => {
    const count = row[`${zone.toLowerCase()}_count`] ?? 0;
    return WorkoutZoneBreakdownRowSchema.parse({
      zone,
      sample_count: count,
      ratio: count / total,
    });
  });
}

type ZoneDurationRow = { zone: string; duration_sec: number | null };

function zoneTimeDistributionSql(upperOperator: "<" | "<="): string {
  return `WITH scoped AS (
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
            WHERE w.start_ts >= ? AND w.start_ts ${upperOperator} ?
          ),
          intervals AS (
            SELECT
              CASE
                ${HR_ZONE_ORDER.map(
                  (zone) =>
                    `WHEN bpm BETWEEN ${HR_ZONES[zone].min} AND ${HR_ZONES[zone].max} THEN '${zone}'`,
                ).join("\n                ")}
              END AS zone,
              GREATEST(
                0,
                LEAST(
                  EXTRACT(EPOCH FROM COALESCE(next_ts, workout_end_ts)) - EXTRACT(EPOCH FROM ts),
                  ?
                )
              ) AS duration_sec
            FROM scoped
          )
          SELECT zone, SUM(duration_sec) AS duration_sec
          FROM intervals
          WHERE zone IS NOT NULL
          GROUP BY zone`;
}

// Time-in-zone is estimated from consecutive HR samples inside workout windows.
// Each interval is attributed to the zone of its starting sample and capped to
// avoid overcounting sparse gaps in HealthKit exports.
export async function getZoneTimeDistribution(
  db: Db,
  range: DateRange,
): Promise<ZoneTimeDistributionRow[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = zoneTimeDistributionSql(upper.operator);
  const rows = await db.all<ZoneDurationRow>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
    MAX_ZONE_INTERVAL_SEC,
  ]);
  const byZone = new Map(rows.map((row) => [row.zone, row.duration_sec ?? 0]));
  const total = HR_ZONE_ORDER.reduce((sum, zone) => sum + (byZone.get(zone) ?? 0), 0);
  if (total <= 0) return [];
  return HR_ZONE_ORDER.map((zone) => {
    const durationSec = byZone.get(zone) ?? 0;
    return ZoneTimeDistributionRowSchema.parse({
      zone,
      duration_sec: durationSec,
      ratio: durationSec / total,
    });
  });
}
