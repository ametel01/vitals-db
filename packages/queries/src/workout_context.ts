import {
  type WorkoutEvent,
  WorkoutEventSchema,
  type WorkoutMetadata,
  WorkoutMetadataSchema,
  type WorkoutRoute,
  WorkoutRouteSchema,
  type WorkoutStat,
  WorkoutStatSchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { toIsoDateTime } from "./dates";

interface WorkoutStatRow {
  workout_id: string;
  type: string;
  start_ts: Date;
  end_ts: Date;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  sum: number | null;
  unit: string | null;
}

interface WorkoutEventRow {
  workout_id: string;
  type: string;
  ts: Date;
  duration_sec: number | null;
}

interface WorkoutMetadataRow {
  workout_id: string;
  key: string;
  value: string;
}

interface WorkoutRouteRow {
  workout_id: string;
  start_ts: Date;
  end_ts: Date;
  source: string | null;
  path: string | null;
}

export async function getWorkoutStats(db: Db, workoutId: string): Promise<WorkoutStat[]> {
  const rows = await db.all<WorkoutStatRow>(
    `SELECT workout_id, type, start_ts, end_ts, average, minimum, maximum, sum, unit
     FROM workout_stats
     WHERE workout_id = ?
     ORDER BY type`,
    [workoutId],
  );
  return rows.map((row) =>
    WorkoutStatSchema.parse({
      ...row,
      start_ts: toIsoDateTime(row.start_ts),
      end_ts: toIsoDateTime(row.end_ts),
    }),
  );
}

export async function getWorkoutEvents(db: Db, workoutId: string): Promise<WorkoutEvent[]> {
  const rows = await db.all<WorkoutEventRow>(
    `SELECT workout_id, type, ts, duration_sec
     FROM workout_events
     WHERE workout_id = ?
     ORDER BY ts, type`,
    [workoutId],
  );
  return rows.map((row) =>
    WorkoutEventSchema.parse({
      ...row,
      ts: toIsoDateTime(row.ts),
    }),
  );
}

export async function getWorkoutMetadata(db: Db, workoutId: string): Promise<WorkoutMetadata[]> {
  const rows = await db.all<WorkoutMetadataRow>(
    `SELECT workout_id, key, value
     FROM workout_metadata
     WHERE workout_id = ?
     ORDER BY key, value`,
    [workoutId],
  );
  return rows.map((row) => WorkoutMetadataSchema.parse(row));
}

export async function getWorkoutRoutes(db: Db, workoutId: string): Promise<WorkoutRoute[]> {
  const rows = await db.all<WorkoutRouteRow>(
    `SELECT workout_id, start_ts, end_ts, source, path
     FROM workout_routes
     WHERE workout_id = ?
     ORDER BY start_ts`,
    [workoutId],
  );
  return rows.map((row) =>
    WorkoutRouteSchema.parse({
      ...row,
      start_ts: toIsoDateTime(row.start_ts),
      end_ts: toIsoDateTime(row.end_ts),
    }),
  );
}
