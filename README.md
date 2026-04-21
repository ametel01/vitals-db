# vitals-db

`vitals-db` ingests Apple Health export XML into DuckDB and serves a small analytics dashboard on top of it, including a dedicated sleep detail page.

The repo has four main pieces:

- `packages/ingest`: streaming XML parser and incremental importer for Apple Health exports
- `packages/db`: DuckDB connection and SQL migrations
- `apps/server`: Hono API plus the `health` CLI
- `apps/web`: Next.js dashboard that reads from the API

Today the implementation covers:

- workout imports and workout detail pages
- heart-rate time series for workouts
- resting heart rate daily averages
- heart rate variability daily averages
- walking heart rate daily averages
- sleep total hours, efficiency, and consistency summary plus nightly breakdown
- dedicated `/sleep` page with nightly cards, stage totals, and segment timeline
- simple workout load (`duration_sec * avg_hr`)
- VO2 max daily averages
- running speed and running power daily averages
- steps, distance, and energy daily totals
- weekly workout activity served by the API
- Z2 ratio, full Z1..Z5 zones distribution, and heart-rate drift for workouts

## Stack

- Bun workspaces
- TypeScript
- `saxes` for streaming XML parsing
- DuckDB for storage and analytics
- Hono for the API
- Next.js App Router + ECharts for the dashboard

## What gets ingested from Apple Health XML

The importer currently maps these Apple Health types into analytics tables:

- `HKWorkoutActivityType*` workouts
- `HKQuantityTypeIdentifierHeartRate`
- `HKQuantityTypeIdentifierRestingHeartRate`
- `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
- `HKQuantityTypeIdentifierWalkingHeartRateAverage`
- `HKQuantityTypeIdentifierStepCount`
- `HKQuantityTypeIdentifierDistanceWalkingRunning`
- `HKQuantityTypeIdentifierActiveEnergyBurned`
- `HKQuantityTypeIdentifierBasalEnergyBurned`
- `HKQuantityTypeIdentifierVO2Max`
- `HKQuantityTypeIdentifierRunningSpeed`
- `HKQuantityTypeIdentifierRunningPower`
- `HKCategoryTypeIdentifierSleepAnalysis`

Since `0.8.0`, sleep ingest preserves both:

- normalized `sleep.state` (`asleep` / `in_bed` / `awake`) for the existing summary queries
- additive `sleep.raw_state` for Apple sleep stages such as Core, Deep, REM, and Unspecified

Import behavior in the current code:

- timestamps are normalized to UTC before writing to DuckDB
- imports are incremental by default
- a 24-hour lookback buffer is applied around the last imported timestamp
- `_ingest_seen` is used for deduplication across repeated imports
- records with `HKWasUserEntered=1` are skipped
- unsupported Apple Health record types are ignored

## Setup

Prerequisite: Bun installed locally.

```bash
bun install
```

## Ingest Data From XML

Import your Apple Health export into DuckDB:

```bash
bun run health ingest /path/to/export.xml
```

By default the database file is `./vitals.duckdb`. You can override it:

```bash
DB_PATH=./my-health.duckdb bun run health ingest /path/to/export.xml
```

There is also a committed sample file you can use to try the app:

```bash
bun run health ingest fixtures/sample.xml
```

Other supported CLI commands:

```bash
bun run health serve
bun run health rebuild
```

- `serve` starts the API and runs migrations first
- `rebuild` clears analytics tables and re-imports the last imported file in full

### Rebuild After Upgrading To `0.8.0`

If you already had a local database before `0.8.0`, the migration adds the
nullable `sleep.raw_state` column but it cannot backfill raw sleep stages from
rows that were already normalized and stored.

If you want the new `/sleep` page to show REM / Core / Deep / Unspecified
detail for historical data, run:

```bash
bun run health rebuild
```

Without a rebuild:

- `GET /metrics/sleep` remains backward compatible
- `GET /metrics/sleep/nightly` remains backward compatible
- the new `/sleep` page still works, but older nights may only show normalized
  segments and no stage totals

## Start The Dashboard

Run the API in one terminal:

```bash
DB_PATH=./vitals.duckdb bun run health serve
```

This serves the Hono API on `http://localhost:8787` by default.

Run the web app in a second terminal:

```bash
bun run --filter @vitals/web dev
```

Then open `http://localhost:3000`.

If the API is not on `http://localhost:8787`, point the web app at it:

```bash
VITALS_API_URL=http://localhost:9999 bun run --filter @vitals/web dev
```

If you also changed the server port, start the API with:

```bash
PORT=9999 DB_PATH=./vitals.duckdb bun run health serve
```

## Dashboard Views

The current UI has:

- `/`: 30-day resting HR, 30-day sleep summary, 30-day VO2 max, 30-day HRV,
  30-day steps, 30-day walking HR, a Performance section with 30-day running
  speed and running power, and 12-week workout activity
- `/sleep`: nightly sleep list, asleep vs in-bed trend, selected-night segment
  timeline, and stage totals when raw sleep stages are available
- `/workouts`: latest 100 workouts with type and date filters
- `/workouts/:id`: workout duration, Z2 ratio, HR drift classification, load,
  HR chart, and Z1..Z5 zones-distribution stacked bar

## API Surface

The server currently exposes:

- `GET /workouts`
- `GET /workouts/:id`
- `GET /workouts/:id/hr`
- `GET /workouts/:id/zones`
- `GET /metrics/zones`
- `GET /metrics/resting-hr`
- `GET /metrics/sleep`
- `GET /metrics/sleep/nightly`
- `GET /metrics/sleep/nights`
- `GET /metrics/sleep/segments`
- `GET /metrics/load`
- `GET /metrics/vo2max`
- `GET /metrics/hrv`
- `GET /metrics/walking-hr`
- `GET /metrics/speed`
- `GET /metrics/power`
- `GET /metrics/activity`
- `GET /metrics/steps`
- `GET /metrics/distance`
- `GET /metrics/energy`

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for query params,
response DTOs, and error shapes. Date-only bounds are treated as full UTC days.

## Useful Environment Variables

- `DB_PATH`: DuckDB file path, default `./vitals.duckdb`
- `PORT`: API port for `health serve`, default `8787`
- `VITALS_API_URL`: base URL used by the Next.js app, default `http://localhost:8787`
- `NODE_ENV`: parsed by the server env loader, default `development`

## Development Checks

```bash
bun test
bun run typecheck
bun run check
```

The repo test suite currently passes end to end, including ingest, queries, API routes, and the committed sample fixture.
