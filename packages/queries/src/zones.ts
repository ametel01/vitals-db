import { HR_ZONES, type ZonesRow, ZonesRowSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

// Spec §4.1. Only Z2 is defined in HR_ZONES today; the stacked-zone chart is
// v0.2 work once non-Z2 boundaries are chosen. We surface `z2_ratio` nullable
// because an empty window has no valid ratio.
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
