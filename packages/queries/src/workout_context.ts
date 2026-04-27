import {
  type WorkoutContextLabel,
  type WorkoutContextSummary,
  WorkoutContextSummarySchema,
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

interface WorkoutContextSummaryRow {
  workout_id: string;
  route_count: number | bigint;
  stat_count: number | bigint;
  pause_count: number | bigint;
  segment_count: number | bigint;
  metadata_count: number | bigint;
  indoor_signal_count: number | bigint;
  outdoor_signal_count: number | bigint;
  has_weather_count: number | bigint;
  has_elevation_count: number | bigint;
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

export async function getWorkoutContextSummary(
  db: Db,
  workoutId: string,
): Promise<WorkoutContextSummary | null> {
  const row = await db.get<WorkoutContextSummaryRow>(
    `WITH
       w AS (
         SELECT id
         FROM workouts
         WHERE id = ?
       ),
       metadata_flags AS (
         SELECT
           wm.workout_id,
           SUM(CASE
             WHEN LOWER(wm.key) LIKE '%indoor%' AND LOWER(wm.value) IN ('1', 'true', 'yes') THEN 1
             ELSE 0
           END) AS indoor_signal_count,
           SUM(CASE
             WHEN LOWER(wm.key) LIKE '%indoor%' AND LOWER(wm.value) IN ('0', 'false', 'no') THEN 1
             ELSE 0
           END) AS outdoor_signal_count,
           SUM(CASE
             WHEN LOWER(wm.key) LIKE '%weather%' OR LOWER(wm.value) LIKE '%weather%' THEN 1
             ELSE 0
           END) AS has_weather_count,
           SUM(CASE
             WHEN LOWER(wm.key) LIKE '%elevation%'
                OR LOWER(wm.key) LIKE '%altitude%'
                OR LOWER(wm.value) LIKE '%elevation%'
                OR LOWER(wm.value) LIKE '%altitude%' THEN 1
             ELSE 0
           END) AS has_elevation_count
         FROM workout_metadata wm
         GROUP BY wm.workout_id
       )
     SELECT
       w.id AS workout_id,
       (SELECT COUNT(*) FROM workout_routes wr WHERE wr.workout_id = w.id) AS route_count,
       (SELECT COUNT(*) FROM workout_stats ws WHERE ws.workout_id = w.id) AS stat_count,
       (
         SELECT COUNT(*)
         FROM workout_events we
         WHERE we.workout_id = w.id
           AND LOWER(we.type) LIKE '%pause%'
       ) AS pause_count,
       (
         SELECT COUNT(*)
         FROM workout_events we
         WHERE we.workout_id = w.id
           AND LOWER(we.type) LIKE '%segment%'
       ) AS segment_count,
       (SELECT COUNT(*) FROM workout_metadata wm WHERE wm.workout_id = w.id) AS metadata_count,
       COALESCE(mf.indoor_signal_count, 0) AS indoor_signal_count,
       COALESCE(mf.outdoor_signal_count, 0) AS outdoor_signal_count,
       COALESCE(mf.has_weather_count, 0) AS has_weather_count,
       COALESCE(mf.has_elevation_count, 0) AS has_elevation_count
     FROM w
     LEFT JOIN metadata_flags mf ON mf.workout_id = w.id`,
    [workoutId],
  );
  if (row === null) return null;

  const routeCount = Number(row.route_count);
  const indoorSignalCount = Number(row.indoor_signal_count);
  const outdoorSignalCount = Number(row.outdoor_signal_count);
  const contextLabel = classifyContext(routeCount, indoorSignalCount, outdoorSignalCount);

  return WorkoutContextSummarySchema.parse({
    workout_id: row.workout_id,
    context_label: contextLabel,
    route_count: routeCount,
    stat_count: Number(row.stat_count),
    pause_count: Number(row.pause_count),
    segment_count: Number(row.segment_count),
    metadata_count: Number(row.metadata_count),
    has_weather: Number(row.has_weather_count) > 0,
    has_elevation: Number(row.has_elevation_count) > 0,
  });
}

function classifyContext(
  routeCount: number,
  indoorSignalCount: number,
  outdoorSignalCount: number,
): WorkoutContextLabel {
  if (indoorSignalCount > 0) return "indoor";
  if (routeCount > 0) return "outdoor_route";
  if (outdoorSignalCount > 0) return "outdoor_no_route";
  return "unknown";
}
