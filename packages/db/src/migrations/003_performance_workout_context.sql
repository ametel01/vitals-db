ALTER TABLE performance ADD COLUMN IF NOT EXISTS vertical_oscillation_cm DOUBLE;
ALTER TABLE performance ADD COLUMN IF NOT EXISTS ground_contact_time_ms DOUBLE;
ALTER TABLE performance ADD COLUMN IF NOT EXISTS stride_length_m DOUBLE;

CREATE TABLE IF NOT EXISTS workout_stats (
  workout_id TEXT,
  type TEXT,
  start_ts TIMESTAMP,
  end_ts TIMESTAMP,
  average DOUBLE,
  minimum DOUBLE,
  maximum DOUBLE,
  sum DOUBLE,
  unit TEXT
);
CREATE INDEX IF NOT EXISTS workout_stats_workout_idx ON workout_stats(workout_id);

CREATE TABLE IF NOT EXISTS workout_events (
  workout_id TEXT,
  type TEXT,
  ts TIMESTAMP,
  duration_sec DOUBLE
);
CREATE INDEX IF NOT EXISTS workout_events_workout_idx ON workout_events(workout_id);

CREATE TABLE IF NOT EXISTS workout_metadata (
  workout_id TEXT,
  key TEXT,
  value TEXT
);
CREATE INDEX IF NOT EXISTS workout_metadata_workout_idx ON workout_metadata(workout_id);

CREATE TABLE IF NOT EXISTS workout_routes (
  workout_id TEXT,
  start_ts TIMESTAMP,
  end_ts TIMESTAMP,
  source TEXT,
  path TEXT
);
CREATE INDEX IF NOT EXISTS workout_routes_workout_idx ON workout_routes(workout_id);
