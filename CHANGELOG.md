# Changelog

All notable changes to this project are documented here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-04-21

Zones-distribution slice per `local-docs/IMPLEMENTATION_PLAN_0.5.0.md`.
Expands the HR zone model from Z2-only to a full Z1..Z5 set and ships a
per-workout breakdown end-to-end: DTO → query → route → client → stacked-bar
chart on the workout-detail page. The existing scalar `z2_ratio` contract is
preserved exactly: `ZonesRowSchema` is unchanged, `/metrics/zones` still
returns `{ z2_ratio }`, and the Z2 ratio stat card remains on the workout
detail page.

### Added — core (`packages/core`)

- `HR_ZONES` expanded from `{ Z2 }` to `{ Z1, Z2, Z3, Z4, Z5 }`. Z2 is pinned
  to `115–125` to keep the existing `z2_ratio` semantic contract; the
  surrounding zones partition the integer bpm range with contiguous
  inclusive-`BETWEEN` bounds so every practical sample falls in exactly one
  zone.
- `HR_ZONE_ORDER` — ordered tuple `["Z1", "Z2", "Z3", "Z4", "Z5"]` used to
  drive query shape, route output, and chart series order.
- `HRZoneNameSchema`, `WorkoutZoneBreakdownRowSchema` / `WorkoutZoneBreakdownRow`
  (`zone`, `sample_count`, `ratio`), and a matching
  `WorkoutZoneBreakdownListSchema`. Modeled on `sample_count` and `ratio`
  rather than claimed "seconds in zone" because `heart_rate` stores discrete
  samples with uneven intervals.
- Zones test pins Z1/Z3/Z4/Z5 boundaries and asserts no gaps or overlaps
  across the Z1..Z5 partition.
- DTO tests round-trip each zone label, reject non-integer / out-of-range
  values, reject unknown zone names, and accept the empty list.

### Added — queries (`packages/queries`)

- `getWorkoutZoneBreakdown(db, workoutId)` — one SQL scan with N+1
  `COUNT(*) FILTER (…)::INTEGER` columns (`total` plus one `<zone>_count` per
  zone), reusing the `heart_rate ⨝ workouts` window from `getWorkoutZones`.
  Returns `WorkoutZoneBreakdownRow[]` in `Z1..Z5` order. Returns `[]` for an
  unknown workout or a workout with zero HR samples.
- `getZones` and `getWorkoutZones` are untouched; the scalar `z2_ratio`
  contract is preserved.
- Tests cover ordered output, counts summing to total, `ratio` matching the
  scalar `z2_ratio` for Z2, and the empty-workout path.

### Added — API (`apps/server`)

- `GET /workouts/:id/zones` — returns `WorkoutZoneBreakdownRow[]` on 200.
  Mirrors `/workouts/:id/hr`: validates `id`, 404s on a missing workout via
  `getWorkoutSummary`, then returns the typed rows. Additive to
  `/metrics/zones`, which continues to return the scalar `z2_ratio`.
- Server tests cover ordered Z1..Z5 output with counts, sum-to-1 ratios,
  404 on missing workout, and `[]` for the no-HR walking fixture.

### Added — web (`apps/web`)

- `getWorkoutZonesBreakdown(id)` client helper in `lib/api.ts`, Zod-validated
  against `WorkoutZoneBreakdownListSchema`.
- Workout detail page (`app/workouts/[id]/page.tsx`) loads the breakdown
  beside `getWorkoutDetail` and `getWorkoutHR`, and renders a new "Zones
  distribution" card. The card uses the existing `StackedBar` primitive with
  a single `["Workout"]` category, one stacked segment per zone in `Z1..Z5`
  order, stable per-zone colors, and `% of samples` on the y-axis. Empty and
  error states match the HR chart's convention.
- The existing Z2 ratio stat card is intentionally kept; the new chart is
  purely additive for this release.

### Changed — docs

- `docs/API_CONTRACT.md` adds the `GET /workouts/:id/zones` entry and calls
  out that it is additive to `/metrics/zones`.
- `README.md` "Dashboard Views", "API Surface", and the top-level feature
  summary now reflect the Z1..Z5 zones distribution on workout detail.

### Release gate

- `bun run test` (201/201), `bun run typecheck`, `bun run build` all green.
- Existing scalar zone contracts remain unchanged:
  `ZonesRowSchema = { z2_ratio }` is untouched and `/metrics/zones` still
  returns the same shape. The new zone breakdown route and chart are
  additive only.

[0.5.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.5.0

## [0.4.0] — 2026-04-21

Movement metrics slice per `local-docs/IMPLEMENTATION_PLAN_0.4.0.md`. Surfaces
the explicit activity/movement data already being ingested (steps, distance,
energy) and promotes the existing weekly-workout aggregation from a client-side
deriver to a real API endpoint. No ingest changes, no changes to existing route
payload shapes, and `ActivityPoint` semantics are preserved.

### Added — core (`packages/core`)

- `StepsPointSchema` / `StepsPoint` (`day`, `total_steps`).
- `DistancePointSchema` / `DistancePoint` (`day`, `total_meters`).
- `EnergyPointSchema` / `EnergyPoint` (`day`, `active_kcal`, `basal_kcal`).
- Round-trip and validation tests for each (ISO day, non-negative totals) in
  `dto.test.ts`.

### Added — queries (`packages/queries`)

- `getStepsDaily(db, range)` — UTC-day buckets `SUM(count)` from `steps`.
- `getDistanceDaily(db, range)` — UTC-day buckets `SUM(meters)` from
  `distance`.
- `getEnergyDaily(db, range)` — UTC-day buckets `SUM(active_kcal)` and
  `SUM(basal_kcal)` independently with `COALESCE`, so a sample carrying only
  one column does not null the other's daily total.
- All three route through `normalizeRangeStart` / `normalizeRangeEnd` for the
  shared inclusive-date-only-upper-bound semantics.
- Tests cover grouping across multiple days, an inclusive date-only upper
  bound, and empty windows.

### Added — API (`apps/server`)

- `GET /metrics/activity` — wires the existing `getWeeklyActivity` to the HTTP
  surface, returning `ActivityPoint[]` with unchanged semantics (ISO-week,
  Monday-start, workouts-only).
- `GET /metrics/steps` — returns `StepsPoint[]`, day-bucketed.
- `GET /metrics/distance` — returns `DistancePoint[]`, day-bucketed.
- `GET /metrics/energy` — returns `EnergyPoint[]`, day-bucketed.
- All four routes use the shared `parseRange` flow and return the same
  `400 { error: "invalid_query", issues }` shape as the other `/metrics`
  routes.
- Server fixture gains steps/distance/energy rows; tests cover happy paths,
  invalid-range 400s, and an empty-window `[]` for `/metrics/steps`.

### Added — web (`apps/web`)

- `getActivity`, `getSteps`, `getDistance`, `getEnergy` client helpers in
  `lib/api.ts`, Zod-validated against matching list schemas.
- Dashboard `StepsCard`: latest-day primary stat, 30-day average secondary
  stat, 30-day `LineChart`, plus error and empty states. Uses the shared
  30-day window.

### Changed — web (`apps/web`)

- `WorkoutActivityChart` now prefers `/metrics/activity` from the server and
  falls back to the local `deriveWeeklyActivity` only if the server call
  fails. The dashboard now fetches `/workouts` only on that fallback path
  instead of on every successful render. `deriveWeeklyActivity` is
  intentionally retained for back-compat in this release.

### Changed — docs

- `docs/API_CONTRACT.md` adds `GET /metrics/activity`,
  `GET /metrics/steps`, `GET /metrics/distance`, and `GET /metrics/energy`.
- `README.md` "Dashboard Views", "API Surface", and the top-level feature
  summary now reflect steps plus server-backed weekly activity.

### Release gate

- `bun run test` (188/188), `bun run typecheck`, `bun run build` all green.
- No existing DTO or route payload changed shape; all additions are additive.

[0.4.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.4.0

## [0.3.0] — 2026-04-21

HRV vertical slice per `local-docs/IMPLEMENTATION_PLAN_0.3.0.md`. Takes HRV from
ingested-only data (one of the metrics deferred in 0.1.0) to a fully shipped
trend: DTO → query → route → client → dashboard card. No ingest changes, no
changes to existing routes.

### Added — core (`packages/core`)

- `HRVPointSchema` / `HRVPoint` (`day`, `avg_hrv`), mirroring
  `VO2MaxPointSchema` and `RestingHRPointSchema`. Round-trip and validation
  tests (ISO day, positive avg) added in `dto.test.ts`.

### Added — queries (`packages/queries`)

- `getHRVDaily(db, range)` — UTC-day buckets `AVG(value)` from the `hrv`
  table, routed through `normalizeRangeStart` / `normalizeRangeEnd` for the
  shared date-bound semantics. Tests cover grouping with a duplicate-day
  sample, inclusive date-only upper bound, and empty windows.

### Added — API (`apps/server`)

- `GET /metrics/hrv` — same `parseRange` flow and error shape as every other
  `/metrics` route. Returns `HRVPoint[]`, day-bucketed. Server fixture
  gains HRV rows and tests cover the happy path, invalid-range 400, and
  empty-window `[]`.

### Added — web (`apps/web`)

- `getHRV(range)` client helper in `lib/api.ts`, Zod-validated against
  `HRVListSchema = z.array(HRVPointSchema)`.
- Dashboard `HRVCard` modeled on `VO2MaxCard`: latest-day primary stat,
  30-day average secondary stat, 30-day `LineChart`, plus error and empty
  states. Uses the shared 30-day window.

### Changed — web (`apps/web`)

- Dashboard top grid switched from `cols-3` to `cols-4` to seat resting HR,
  sleep, VO2 max, and HRV on one row on desktop (the `.grid.cols-4` rule
  added in 0.2.0 is reused unchanged).

### Changed — docs

- `docs/API_CONTRACT.md` adds the `GET /metrics/hrv` entry.
- `README.md` "Dashboard Views" now lists HRV; "API Surface" now lists
  `GET /metrics/hrv`; the top-level feature summary now includes HRV daily
  averages.

### Release gate

- `bun run test` (164/164), `bun run typecheck`, `bun run build` all green.
- No existing route or DTO changed shape; `HRVPoint` is additive.

[0.3.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.3.0

## [0.2.0] — 2026-04-21

Frontend completion release per `local-docs/IMPLEMENTATION_PLAN_0.2.0.md`. Closes
the two highest-value UI gaps identified in `local-docs/GAP_ANALYSIS.md` §4 by
surfacing data the backend already ships. No new routes, no DTO shape changes,
no query-layer changes.

### Added — web (`apps/web`)

- Dashboard VO2 max card driven by the existing `/metrics/vo2max` endpoint,
  modeled on `RestingHRCard`: latest-day primary stat, 30-day average
  secondary stat, 30-day `LineChart`, plus error and empty states. Uses the
  same 30-day window as resting HR and sleep.
- Workout-detail `Load` stat card rendering `WorkoutDetail.load` with
  em-dash fallback for workouts without HR coverage. Value comes from the
  unchanged `/workouts/:id` payload.

### Changed — web (`apps/web`)

- Dashboard top grid switched from `cols-2` to `cols-3` to seat resting HR,
  sleep, and VO2 max on one row on desktop.
- Workout-detail stat row switched from `cols-3` to `cols-4` to seat
  Duration, Z2 ratio, HR drift, and Load.
- `apps/web/app/globals.css` gains a `.grid.cols-4` rule with a 1200 px
  breakpoint (4 → 2 columns) and the shared 900 px breakpoint (→ 1 column).

### Changed — docs

- `README.md` "Dashboard Views" now reflects the shipped `0.2.0` UI surface:
  the dashboard includes VO2 max and workout detail includes Load.

### Release gate

- `bun run test` (155/155), `bun run typecheck`, `bun run build` all green.
- No route additions, no DTO additions, no API response changes.

[0.2.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.2.0

## [0.1.1] — 2026-04-21

Baseline hardening release per `local-docs/IMPLEMENTATION_PLAN_0.1.1.md`. No
new endpoints, no DTO shape changes, no new dashboard surfaces — docs, copy,
and tests only.

### Changed — web (`apps/web`)

- Replaced the `SleepCard` caption that promised a v0.2 `/metrics/sleep/nightly`
  endpoint with factual copy describing the shipped 30-day summary and the
  definitions of its efficiency and consistency stats.

### Added — tests (`apps/server`)

- `/workouts` now asserts descending `start_ts` ordering across the returned
  array, not just the expected id sequence.
- `/workouts/:id` now pins `drift_pct`, `drift_classification`, `load`, and
  `z2_ratio` on the running-workout fixture.
- `/metrics/zones` gains a case that verifies nullable `z2_ratio` on an empty
  window.
- `/metrics/load` now asserts `workout_id`, `duration_sec`, `avg_hr`, and
  `load` for both the HR-covered and no-HR workouts.
- Explicit invalid-`from`/`to` 400 paths added for `/metrics/zones`,
  `/metrics/sleep`, `/metrics/load`, and `/metrics/vo2max` (previously only
  `/metrics/resting-hr` had a dedicated error-path case).

### Added — docs

- New `docs/API_CONTRACT.md` listing every live route, its query params,
  and the top-level DTO name from `packages/core/src/dto.ts`.
- `README.md` "API Surface" section now links to the contract doc instead of
  duplicating per-route query-string details.

[0.1.1]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.1.1

## [0.1.0] — 2026-04-21

First tagged release. Ships the MVP cut defined in `local-docs/IMPLEMENTATION_PLAN.md` §M8:
ingestion for heart/workouts/sleep domains, workouts list, HR-per-workout, resting-HR
trend, and sleep duration — all driven by real Apple Health export XML.

### Added — ingestion (`packages/ingest`)

- Streaming `saxes` XML parser over `ReadableStream` with UTF-8 streaming decode.
- Scoped identifier allow-list for the twelve HK quantity/category types in scope
  (heart rate, resting HR, HRV SDNN, walking HR avg, step count, distance W/R,
  active/basal energy, VO2 max, running speed, running power, sleep analysis)
  plus `HKWorkoutActivityType*` workouts.
- Mappers with unit normalization for distance (→ meters), energy (→ kcal),
  and running speed (→ m/s).
- Manual-entry exclusion via `HKWasUserEntered=1` metadata.
- UTC normalization at ingest (`parseHKDate`) so downstream `DATE(ts)` buckets
  are UTC-day consistent.
- Batched writer (default 10 000 rows/transaction) with dedup via
  `_ingest_seen(dedup_key = type|start|end|value|source)`.
- Incremental ingest with a 24-hour lookback buffer, tracking `last_import_ts`
  and `last_import_file` in `_ingest_state`.

### Added — storage (`packages/db`)

- DuckDB connection wrapper on `@duckdb/node-api` (chosen over legacy `duckdb`
  binding for Bun + macOS arm64 compatibility).
- `001_init.sql` creates all ten analytics tables from spec §2 plus
  `_migrations`, `_ingest_state`, and `_ingest_seen`.
- Idempotent migration runner keyed by filename.

### Added — queries (`packages/queries`)

- `listWorkouts`, `getWorkoutSummary`, `getWorkoutDetail`.
- `getWorkoutHR` — per-workout HR stream (spec §4.2).
- `getZones`, `getWorkoutZones` — Z2 ratio (spec §4.1; non-Z2 boundaries
  intentionally deferred to v0.2).
- `getWorkoutDrift` — first-half vs second-half avg HR with
  stable/moderate/high classification (spec §4.3).
- `getRestingHRDaily` (spec §4.4).
- `getSleepSummary` — total hours, efficiency proxy, consistency stddev
  (spec §4.5).
- `getWeeklyActivity` — workouts-only weekly bucket (spec §4.6 v0.1 slice).
- `getVO2MaxDaily` (spec §4.7).
- `getWorkoutLoad`, `getLoadForRange` — `duration_sec × avg_hr` load proxy.

### Added — API (`apps/server`)

- Hono app factory with Zod-parsed query params on every route.
- Endpoints matching spec §5 exactly: `GET /workouts`, `/workouts/:id`,
  `/workouts/:id/hr`, `/metrics/zones`, `/metrics/resting-hr`,
  `/metrics/sleep`, `/metrics/load`, `/metrics/vo2max`.
- `health` CLI with `ingest`, `serve`, and `rebuild` subcommands
  (spec §7). `rebuild` clears analytics tables and `_ingest_seen` in a
  single transaction and re-ingests `last_import_file` in full.

### Added — web (`apps/web`)

- Next.js App Router dashboard with server-side data fetching and a typed
  Zod-validating fetch client.
- `/` dashboard: 30-day resting HR trend + 30-day sleep summary card + 12-week
  weekly workout activity.
- `/workouts` list with type/date filters and server-rendered pagination cap.
- `/workouts/[id]` detail: duration, Z2 ratio, HR drift, HR line chart with
  Z2 band overlay.
- Thin ECharts wrappers (`LineChart`, `StackedBar`) as the only
  `"use client"` components.

### Added — quality pipeline

- Biome 1.9.4 (lint + format, strict config including `noExplicitAny`,
  `noConsoleLog`, `noExcessiveCognitiveComplexity`).
- TypeScript project references with `composite: true` across workspaces,
  driven by `tsc -b`.
- Lefthook pre-commit (Biome on staged files + `tsc -b`) and pre-push
  (`bun run verify`).
- GitHub Actions CI running check → typecheck → test → build on every push
  and PR.
- `bun test` covers ingestion, queries, Hono routes, and the committed
  `fixtures/sample.xml` fixture (150 passing tests at cut).

### Deferred to v0.2 (tracked in `local-docs/GAP_ANALYSIS.md`)

- VO2 max dashboard card (endpoint is ready; card not rendered).
- Workout-detail load stat card (payload carries it; card not rendered).
- Stacked HR-zone chart on workout detail (blocked on Z1/Z3/Z4/Z5
  boundaries, an open plan decision).
- Steps / distance / energy API + UI surfaces.
- HRV, walking HR, running speed, running power — ingested today, no
  query/endpoint/chart yet.
- `/metrics/sleep/nightly` nightly sleep breakdown.

[0.1.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.1.0
