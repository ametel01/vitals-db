# Changelog

All notable changes to this project are documented here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] — 2026-04-21

Endurance-KPI slice per `local-docs/IMPLEMENTATION_PLAN_0.9.0.md`. Ships the
remaining high-signal training metrics before the `1.0.0` contract freeze
without widening `WorkoutDetail` or changing the existing drift / `z2_ratio` /
`/metrics/resting-hr` contracts.

### Added — core / queries / API

- `RestingHRRollingPoint`, `WorkoutPaceAtHR`, `WorkoutDecoupling`, and
  `WorkoutEfficiency` DTOs.
- `getRestingHRRolling7d` — trailing 7-day average over the shipped daily
  resting-HR series, emitting only existing day rows.
- `getWorkoutEfficiency` — aligned workout HR + speed logic for:
  - pace at fixed HR band (`120–130 bpm` by default)
  - fixed-duration decoupling over the first `45–60` minutes only
- `GET /metrics/resting-hr/rolling`
- `GET /workouts/:id/efficiency`

### Added — web

- Dedicated `/performance` page with:
  - rolling 7-day resting HR chart
  - recent runs table showing fixed-HR pace, decoupling, and explicit Z2 share
- Workout detail now renders:
  - pace at `120–130 bpm`
  - fixed-duration decoupling
  - explicit "Z2 share" labeling on the existing `z2_ratio`
- Navigation and dashboard performance section now link to `/performance`.

### Changed — docs

- `README.md`, `docs/API_CONTRACT.md`, `local-docs/GAP_ANALYSIS.md`,
  `local-docs/RELEASE_PLAN.md`, and
  `local-docs/IMPLEMENTATION_PLAN_1.0.0.md` now treat the endurance KPI layer
  as shipped and define the canonical formulas explicitly.

### Release gate

- `WorkoutDetail.drift_pct`, `WorkoutDetail.z2_ratio`, and
  `GET /metrics/resting-hr` remain backward compatible.
- Missing aligned HR/speed samples return null KPI values rather than false
  zeroes.
- `bun run test`, `bun run typecheck`, and `bun run build` run green for the
  release candidate.

[0.9.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.9.0

## [0.8.0] — 2026-04-21

Sleep-detail slice per `local-docs/IMPLEMENTATION_PLAN_0.8.0.md`. Ships a
dedicated `/sleep` page, preserves raw Apple sleep stages additively in the
database, and adds page-oriented nightly and segment routes without widening
the existing `/metrics/sleep` or `/metrics/sleep/nightly` contracts.

### Added — core / db / ingest

- `sleep.raw_state` via additive migration `002_sleep_raw_state.sql`. Existing
  normalized `sleep.state` remains unchanged and continues to back the compact
  summary routes.
- Core sleep model now exports raw sleep-state and stage-detail schemas plus
  dedicated DTOs for page-oriented nightly rows and timeline segments.
- Ingest now writes both normalized `state` and preserved `raw_state`, so
  Apple `AsleepCore`, `AsleepDeep`, `AsleepREM`, and `AsleepUnspecified`
  survive storage for later queries.

### Added — queries / API

- `GET /metrics/sleep/nights` — one row per night with bedtime, wake time,
  asleep / in-bed / awake totals, efficiency, and nullable stage totals.
- `GET /metrics/sleep/segments` — ordered timeline rows with normalized state,
  nullable preserved `raw_state`, nullable derived `stage`, and `night`
  grouping for overnight drill-down.
- `getSleepSummary` and `getSleepNightly` now group overnight stage-segment
  rows by a shifted night key so the legacy summary routes stay correct after
  stage-preserving ingest.
- Query and server tests pin multi-night grouping, cross-midnight behavior,
  empty windows, pre-`0.8.0` null-stage fallback, and exact response keys on
  the new routes.

### Added — web

- New `/sleep` page with:
  - selectable window links
  - asleep vs in-bed nightly trend chart
  - nightly drill-down list
  - selected-night segment timeline
  - stage breakdown when raw stage detail exists
- The dashboard sleep card remains compact and now links to `/sleep`.
- Navigation now includes the dedicated Sleep page.

### Changed — docs / release

- `README.md` now documents the dedicated `/sleep` page, the additive sleep
  detail routes, and the upgrade rule that existing databases need
  `bun run health rebuild` to backfill historical raw sleep stages.
- `docs/API_CONTRACT.md` documents `GET /metrics/sleep/nights` and
  `GET /metrics/sleep/segments`.
- `local-docs/GAP_ANALYSIS.md` records that the pre-`1.0.0` sleep-page and
  stage-preservation gaps are resolved in `0.8.0`.

### Release gate

- `bun run test`, `bun run typecheck`, and `bun run build` run green for the
  release candidate.
- `/metrics/sleep` and `/metrics/sleep/nightly` remain backward compatible.
- The new `/sleep` page degrades gracefully for pre-`0.8.0` rows until a
  rebuild backfills `sleep.raw_state`.

[0.8.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.8.0

## [0.7.0] — 2026-04-21

Deprecation-sweep and stabilization slice per
`local-docs/IMPLEMENTATION_PLAN_0.7.0.md`. No public contracts removed, no
route or DTO shapes changed. This release marks internal helpers that are now
transitional only, confirms that first-party UI callers prefer the stable
server-backed paths, and pins the exact response shape of the legacy +
preferred route pairs that ship side-by-side so a drift back toward the
deprecated path is caught before `1.0.0`.

### Changed — web (`apps/web`)

- `deriveWeeklyActivity` in `apps/web/lib/api.ts` is now explicitly
  `@deprecated`. `/metrics/activity` has been the dashboard's primary path
  since `0.4.0`; the client-side deriver is retained only as a compatibility
  fallback on the dashboard when the server call fails and is slated for
  removal in `1.0.0`. The dashboard comment now documents the compatibility
  intent instead of describing it as an equal fallback.

### Added — tests (`apps/server`)

- Contract pins on the legacy + preferred route pairs that ship side by side:
  - `/metrics/zones` — asserts top-level keys are exactly `{ z2_ratio }`,
    guarding the scalar contract against accidental widening now that
    `/workouts/:id/zones` exposes the Z1..Z5 breakdown.
  - `/workouts/:id/zones` — asserts each row has exactly
    `{ zone, sample_count, ratio }`.
  - `/metrics/sleep` — asserts top-level keys are exactly
    `{ total_hours, efficiency, consistency_stddev }`, guarding the summary
    shape against drift from the additive `/metrics/sleep/nightly` route.
  - `/metrics/sleep/nightly` — asserts each row has exactly
    `{ day, asleep_hours, in_bed_hours, efficiency }`.
  - `/metrics/activity` — asserts the row shape and pins semantic equivalence
    with the legacy `/workouts` + Monday-bucketed derivation, so a divergence
    between the server route and the deprecated client deriver is caught
    before the deriver is removed.

### Changed — docs

- `README.md` and `docs/API_CONTRACT.md` remain unchanged — they already
  document only supported public routes, so the `0.7.0` deprecation sweep is
  intentionally documented in code comments and tests rather than the public
  API docs.

### Release gate

- `bun run test` (240/240), `bun run typecheck`, `bun run build`, and
  `bun run check` all green.
- No public route shape or DTO changed. `deriveWeeklyActivity` remains
  exported and callable; only its JSDoc changed.

[0.7.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.7.0

## [0.6.0] — 2026-04-21

Orphaned-metrics slice per `local-docs/IMPLEMENTATION_PLAN_0.6.0.md`. Closes the
lower-priority metrics that were already ingested in 0.1.0 but had no query,
route, or UI surface: walking HR, running speed, and running power. Ships
nightly sleep as an additive `/metrics/sleep/nightly` route alongside the
existing 30-day `/metrics/sleep` summary, which is preserved exactly. No ingest
changes, no breaking route shapes.

### Added — core (`packages/core`)

- `WalkingHRPointSchema` / `WalkingHRPoint` (`day`, `avg_walking_hr`). Mirrors
  `RestingHRPointSchema` — positive `avg_walking_hr`, ISO-date `day`.
- `SpeedPointSchema` / `SpeedPoint` (`day`, `avg_speed`) and
  `PowerPointSchema` / `PowerPoint` (`day`, `avg_power`). Named explicitly per
  metric so the contract does not collapse speed and power into a single
  generic performance DTO. `avg_speed` and `avg_power` accept `0` (rest
  samples) and reject negatives.
- `SleepNightPointSchema` / `SleepNightPoint` (`day`, `asleep_hours`,
  `in_bed_hours`, `efficiency`). `efficiency` is nullable with the same
  semantics as `SleepSummary` — null when a night carries no `in_bed`
  coverage.
- Round-trip and validation tests for each new DTO in `dto.test.ts`.

### Added — queries (`packages/queries`)

- `getWalkingHRDaily(db, range)` — UTC-day buckets `AVG(bpm)` from the
  existing `walking_hr` table, routed through
  `normalizeRangeStart` / `normalizeRangeEnd`.
- `getSpeedDaily(db, range)` and `getPowerDaily(db, range)` — UTC-day buckets
  `AVG(speed)` / `AVG(power)` from the `performance` table with explicit
  `IS NOT NULL` filters. `performance` stores one sparse column per source
  sample (see `vo2max.ts`), so the filter is load-bearing: without it, the
  average collapses to the intersection of co-populated columns.
- `getSleepNightly(db, range)` — additive to `getSleepSummary`. One row per
  night keyed by the UTC `DATE` of the night's first `asleep` start. Raw
  segment-duration sums (same choice as `getSleepSummary`) so `efficiency`
  stays consistent between the summary and the nightly view.
- Tests cover grouping across multiple days, inclusive date-only upper
  bounds, empty windows, sparse-column filters for speed and power, and the
  null-efficiency path on a night with no `in_bed` coverage.

### Added — API (`apps/server`)

- `GET /metrics/walking-hr` — returns `WalkingHRPoint[]`, day-bucketed.
- `GET /metrics/speed` — returns `SpeedPoint[]`, day-bucketed.
- `GET /metrics/power` — returns `PowerPoint[]`, day-bucketed.
- `GET /metrics/sleep/nightly` — returns `SleepNightPoint[]`, one row per
  night. Additive; `GET /metrics/sleep` is unchanged.
- All four routes use the shared `parseRange` flow and emit the same
  `400 { error: "invalid_query", issues }` shape as the other `/metrics`
  routes.
- Server fixture gains walking-HR, speed, and power rows. Tests cover happy
  paths, invalid-range 400s, and empty-window `[]` for each new route.

### Added — web (`apps/web`)

- `getWalkingHR`, `getSpeed`, `getPower`, and `getSleepNightly` client
  helpers in `lib/api.ts`, Zod-validated against matching list schemas.
- Dashboard `WalkingHRCard`: latest-day primary stat, 30-day average
  secondary stat, 30-day `LineChart`, plus error and empty states. Seated
  alongside `StepsCard` in the second row.
- New "Performance" section with `SpeedCard` (m/s) and `PowerCard` (watts),
  both mirroring the `VO2MaxCard` pattern. Grouped under a single subsection
  to keep the dashboard from scattering one-off cards.
- `globals.css` gains a `.section-title` rule used to introduce the
  Performance subsection.

### Changed — docs

- `docs/API_CONTRACT.md` adds `GET /metrics/walking-hr`, `GET /metrics/speed`,
  `GET /metrics/power`, and `GET /metrics/sleep/nightly`. The sleep-nightly
  entry calls out that it is additive to `/metrics/sleep`.
- `README.md` top-level feature summary now includes walking HR, running
  speed, running power, and the nightly sleep breakdown. "Dashboard Views"
  now reflects the walking-HR card and the new Performance section. "API
  Surface" lists all four new routes.

### Release gate

- `bun run test` (235/235), `bun run typecheck`, `bun run build`, and
  `bun run check` all green.
- `SleepSummarySchema` and `/metrics/sleep` are unchanged — the nightly
  breakdown is additive via a new route. No existing DTO or route payload
  changed shape.

[0.6.0]: https://github.com/alexmetelli/vitals-db/releases/tag/v0.6.0

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
