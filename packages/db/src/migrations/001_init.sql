-- Spec §2 analytics tables

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  type TEXT,
  start_ts TIMESTAMP,
  end_ts TIMESTAMP,
  duration_sec DOUBLE,
  source TEXT
);

CREATE TABLE IF NOT EXISTS heart_rate (
  ts TIMESTAMP,
  bpm DOUBLE,
  source TEXT
);
CREATE INDEX IF NOT EXISTS hr_ts_idx ON heart_rate(ts);

CREATE TABLE IF NOT EXISTS resting_hr (
  ts TIMESTAMP,
  bpm DOUBLE
);

CREATE TABLE IF NOT EXISTS hrv (
  ts TIMESTAMP,
  value DOUBLE
);

CREATE TABLE IF NOT EXISTS walking_hr (
  ts TIMESTAMP,
  bpm DOUBLE
);

CREATE TABLE IF NOT EXISTS steps (
  ts TIMESTAMP,
  count DOUBLE
);

CREATE TABLE IF NOT EXISTS distance (
  ts TIMESTAMP,
  meters DOUBLE
);

CREATE TABLE IF NOT EXISTS energy (
  ts TIMESTAMP,
  active_kcal DOUBLE,
  basal_kcal DOUBLE
);

CREATE TABLE IF NOT EXISTS sleep (
  start_ts TIMESTAMP,
  end_ts TIMESTAMP,
  state TEXT
);

CREATE TABLE IF NOT EXISTS performance (
  ts TIMESTAMP,
  vo2max DOUBLE,
  speed DOUBLE,
  power DOUBLE
);

-- Internal bookkeeping (spec §3.4-3.5)

CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS _ingest_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS _ingest_seen (
  dedup_key TEXT PRIMARY KEY,
  record_type TEXT,
  start_ts TIMESTAMP,
  end_ts TIMESTAMP,
  source TEXT
);
