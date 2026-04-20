import { type HRPoint, HRPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { toIsoDateTime } from "./dates";

interface HRRow {
  ts: Date;
  bpm: number;
  source: string | null;
}

// Spec §4.2: HR stream for a single workout. Scoping by workouts.id keeps the
// result set bounded; the index on heart_rate(ts) plus the bounded join makes
// the scan efficient.
const SQL = `SELECT hr.ts, hr.bpm, hr.source
             FROM heart_rate hr
             JOIN workouts w ON hr.ts BETWEEN w.start_ts AND w.end_ts
             WHERE w.id = ?
             ORDER BY hr.ts`;

export async function getWorkoutHR(db: Db, workoutId: string): Promise<HRPoint[]> {
  const rows = await db.all<HRRow>(SQL, [workoutId]);
  return rows.map((row) =>
    HRPointSchema.parse({
      ts: toIsoDateTime(row.ts),
      bpm: row.bpm,
      source: row.source,
    }),
  );
}
