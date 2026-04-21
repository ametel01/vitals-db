import {
  HR_ZONES,
  HR_ZONE_ORDER,
  type WorkoutZoneBreakdownRow,
  WorkoutZoneBreakdownRowSchema,
  type ZonesRow,
  ZonesRowSchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

// Spec §4.1. `getZones` / `getWorkoutZones` continue to return the scalar
// `z2_ratio` contract that 0.1 shipped. `getWorkoutZoneBreakdown` is the
// additive per-zone view introduced in 0.5.0, built on `sample_count` rather
// than claimed "seconds in zone" because heart_rate stores discrete samples
// with uneven spacing.
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
