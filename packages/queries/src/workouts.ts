import {
  type WorkoutDetail,
  WorkoutDetailSchema,
  type WorkoutSummary,
  WorkoutSummarySchema,
} from "@vitals/core";
import type { Db, SqlValue } from "@vitals/db";
import { normalizeRangeEnd, normalizeRangeStart, toIsoDateTime } from "./dates";
import { getWorkoutDrift } from "./drift";
import { getWorkoutLoad } from "./load";
import { getWorkoutZones } from "./zones";

interface WorkoutRow {
  id: string;
  type: string | null;
  start_ts: Date;
  end_ts: Date;
  duration_sec: number;
  source: string | null;
}

function rowToSummary(row: WorkoutRow): WorkoutSummary {
  return WorkoutSummarySchema.parse({
    id: row.id,
    type: row.type ?? "",
    start_ts: toIsoDateTime(row.start_ts),
    end_ts: toIsoDateTime(row.end_ts),
    duration_sec: row.duration_sec,
    source: row.source,
  });
}

export interface ListWorkoutsParams {
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listWorkouts(
  db: Db,
  params: ListWorkoutsParams = {},
): Promise<WorkoutSummary[]> {
  const clauses: string[] = [];
  const values: SqlValue[] = [];
  if (params.type !== undefined) {
    clauses.push("type = ?");
    values.push(params.type);
  }
  if (params.from !== undefined) {
    clauses.push("start_ts >= ?");
    values.push(normalizeRangeStart(params.from));
  }
  if (params.to !== undefined) {
    const upper = normalizeRangeEnd(params.to);
    clauses.push(`start_ts ${upper.operator} ?`);
    values.push(upper.value);
  }
  const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;

  let sql = `SELECT id, type, start_ts, end_ts, duration_sec, source
             FROM workouts
             ${where}
             ORDER BY start_ts DESC`;
  if (params.limit !== undefined) {
    sql += " LIMIT ?";
    values.push(params.limit);
  }
  if (params.offset !== undefined) {
    sql += " OFFSET ?";
    values.push(params.offset);
  }

  const rows = await db.all<WorkoutRow>(sql, values);
  return rows.map(rowToSummary);
}

export async function getWorkoutSummary(db: Db, id: string): Promise<WorkoutSummary | null> {
  const row = await db.get<WorkoutRow>(
    "SELECT id, type, start_ts, end_ts, duration_sec, source FROM workouts WHERE id = ?",
    [id],
  );
  return row === null ? null : rowToSummary(row);
}

export async function getWorkoutDetail(db: Db, id: string): Promise<WorkoutDetail | null> {
  const summary = await getWorkoutSummary(db, id);
  if (summary === null) return null;

  const [drift, loadRow, zones] = await Promise.all([
    getWorkoutDrift(db, id),
    getWorkoutLoad(db, id),
    getWorkoutZones(db, id),
  ]);

  return WorkoutDetailSchema.parse({
    ...summary,
    drift_pct: drift.drift_pct,
    drift_classification: drift.classification,
    load: loadRow?.load ?? null,
    z2_ratio: zones.z2_ratio,
  });
}
