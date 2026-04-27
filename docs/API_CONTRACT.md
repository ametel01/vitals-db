# API Contract — vitals-db

Short reference for every HTTP route currently served by `apps/server`. Route
paths are exact strings registered in `apps/server/src/server.ts` and the
routers under `apps/server/src/routes/`. DTO names below match the exported
type/schema base names in `packages/core/src/dto.ts`; each response is the JSON
payload validated by the corresponding exported Zod schema.

Date bounds (`from`, `to`) accept either `YYYY-MM-DD` or an ISO 8601 datetime
with timezone offset. Date-only bounds are treated as full UTC days.

## Workouts

### `GET /workouts`

Query params (all optional):

- `type` — string
- `from` — date or datetime
- `to` — date or datetime
- `limit` — positive integer
- `offset` — non-negative integer

Response: `WorkoutSummary[]`, ordered by descending `start_ts`.

### `GET /workouts/:id`

Path params:

- `id` — workout id

Response: `WorkoutDetail` on 200. `404` with `{ error: "not_found" }` when the
workout does not exist.

### `GET /workouts/:id/hr`

Path params:

- `id` — workout id

Response: `HRPoint[]` on 200. `404` with `{ error: "not_found" }` when the
workout does not exist.

### `GET /workouts/:id/zones`

Path params:

- `id` — workout id

Response: `WorkoutZoneBreakdownRow[]` on 200, one row per zone in `Z1..Z5`
order with `sample_count` and `ratio = sample_count / total_samples`. Returns
`[]` when the workout has no HR samples. `404` with `{ error: "not_found" }`
when the workout does not exist. Additive to `/metrics/zones`, which continues
to return the scalar `z2_ratio`.

### `GET /workouts/:id/efficiency`

Path params:

- `id` — workout id

Query params (all optional):

- `hr_min` — lower bpm bound for fixed-HR pace, default `120`
- `hr_max` — upper bpm bound for fixed-HR pace, default `130`

Response: `WorkoutEfficiency` on 200 with:

- `pace_at_hr` — aligned-sample fixed-HR pace for the requested band
- `decoupling` — fixed-duration aerobic-efficiency metric over the first
  `45–60` minutes only

Nullability rules:

- missing aligned HR/speed samples produce null KPI values rather than `0`
- decoupling is null when the run is shorter than 45 minutes or when one half
  of the fixed window lacks aligned samples

Returns `404` with `{ error: "not_found" }` when the workout does not exist.
Additive to `WorkoutDetail`, which keeps the older `drift_pct` and `z2_ratio`
contract unchanged.

## Metrics

Every route under `/metrics` requires both `from` and `to`. Invalid or missing
values return `400` with `{ error: "invalid_query", issues: ZodIssue[] }`.

### `GET /metrics/zones`

Query params:

- `from` — required
- `to` — required

Response: `ZonesRow`. `z2_ratio` is nullable when the window has no HR samples.

### `GET /metrics/resting-hr`

Query params:

- `from` — required
- `to` — required

Response: `RestingHRPoint[]`, day-bucketed.

### `GET /metrics/resting-hr/rolling`

Query params:

- `from` — required
- `to` — required

Response: `RestingHRRollingPoint[]`, one sparse row per existing daily
resting-HR day with `avg_rhr_7d` computed over the trailing 7 UTC days ending
on that row's `day`. The route does not synthesize missing calendar days and is
defined over the shipped daily resting-HR series rather than a second raw
aggregation path.

### `GET /metrics/sleep`

Query params:

- `from` — required
- `to` — required

Response: `SleepSummary`.

### `GET /metrics/sleep/nightly`

Query params:

- `from` — required
- `to` — required

Response: `SleepNightPoint[]`, one row per night keyed by the UTC `DATE` of
each night's first `asleep` start. `asleep_hours` and `in_bed_hours` are raw
segment-duration sums (same choice as `/metrics/sleep`). `efficiency` is null
when the night has no `in_bed` coverage. Additive to `/metrics/sleep`, which
continues to return the 30-day summary.

### `GET /metrics/sleep/nights`

Query params:

- `from` — required
- `to` — required

Response: `SleepNightDetail[]`, one row per night for the dedicated sleep page.
Each row includes `bedtime`, `wake_time`, asleep / in-bed / awake totals, and
nullable `core_hours`, `deep_hours`, `rem_hours`, and `unspecified_hours`.
Those stage totals are `null` for nights that were ingested before `0.8.0`
without the additive `sleep.raw_state` backfill. Additive to both
`/metrics/sleep` and `/metrics/sleep/nightly`.

### `GET /metrics/sleep/segments`

Query params:

- `from` — required
- `to` — required

Response: `SleepSegment[]`, ordered by `start_ts`. Each row includes:

- `night` — the bedtime date used to group overnight segments
- normalized `state`
- nullable `raw_state`
- nullable derived `stage`
- `duration_hours`

This route is additive and is intended for timeline / drill-down views rather
than the compact summary cards.

### `GET /metrics/load`

Query params:

- `from` — required
- `to` — required

Response: `LoadRow[]`, one row per workout in range.

### `GET /metrics/vo2max`

Query params:

- `from` — required
- `to` — required

Response: `VO2MaxPoint[]`, day-bucketed.

### `GET /metrics/hrv`

Query params:

- `from` — required
- `to` — required

Response: `HRVPoint[]`, day-bucketed.

### `GET /metrics/walking-hr`

Query params:

- `from` — required
- `to` — required

Response: `WalkingHRPoint[]`, day-bucketed `AVG(bpm)` from the `walking_hr`
table.

### `GET /metrics/speed`

Query params:

- `from` — required
- `to` — required

Response: `SpeedPoint[]`, day-bucketed `AVG(speed)` from the `performance`
table (m/s). Rows with `speed IS NULL` are excluded because `performance` is
stored one sparse column per source sample.

### `GET /metrics/power`

Query params:

- `from` — required
- `to` — required

Response: `PowerPoint[]`, day-bucketed `AVG(power)` from the `performance`
table (watts). Rows with `power IS NULL` are excluded.

### `GET /metrics/activity`

Query params:

- `from` — required
- `to` — required

Response: `ActivityPoint[]`, one row per ISO week (Monday-start) aggregated from
the `workouts` table.

### `GET /metrics/steps`

Query params:

- `from` — required
- `to` — required

Response: `StepsPoint[]`, day-bucketed `SUM(count)` from the `steps` table.

### `GET /metrics/distance`

Query params:

- `from` — required
- `to` — required

Response: `DistancePoint[]`, day-bucketed `SUM(meters)` from the `distance`
table.

### `GET /metrics/energy`

Query params:

- `from` — required
- `to` — required

Response: `EnergyPoint[]`, day-bucketed totals of `active_kcal` and `basal_kcal`
from the `energy` table. Each column is aggregated independently so sparse rows
(active-only or basal-only samples) do not null out the daily total.

## Composite Analytics

Every route under `/metrics/composites` requires both `from` and `to`, with the
same date parsing and `400 { error: "invalid_query", issues: ZodIssue[] }`
behavior as the raw `/metrics` routes.

### `GET /metrics/composites/report`

Query params:

- `from` — required
- `to` — required

Response: `AdvancedCompositeReport`, with four ordered sections:
`fitness_direction`, `easy_run_quality`, `recovery_state`, and
`workout_diagnoses` (rendered as workout flags). The top-level
`next_week_recommendation` is the most conservative action selected from the
strongest section results.

### `GET /metrics/composites/aerobic-efficiency`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` from fixed-HR pace, decoupling, Z2 share, and
resting-HR evidence.

### `GET /metrics/composites/readiness`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` from resting HR, HRV, sleep, and training-load
evidence.

### `GET /metrics/composites/training-strain`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` comparing recent load against recovery markers.

### `GET /metrics/composites/run-fatigue`

Query params:

- `from` — required
- `to` — required

Response: `RunFatigueFlag[]`, ordered by descending workout `start_ts`.

### `GET /metrics/composites/fitness-trend`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` combining VO2 Max, fixed-HR pace, power, and
resting-HR trend evidence.

### `GET /metrics/composites/load-quality`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` combining acute:chronic load, Z2 share, run
decoupling, and run consistency.

### `GET /metrics/composites/recovery-debt`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` from seven-day sleep debt, recovery markers, and
training-load evidence.

### `GET /metrics/composites/consistency-index`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` summarizing consistency across activity, sleep,
resting HR, and HRV.

### `GET /metrics/composites/run-economy`

Query params:

- `from` — required
- `to` — required

Response: `CompositeResult` attributing run economy changes to fitness,
mechanics, output, or mixed economy evidence.

## Error shape

- `400 { error: "invalid_query", issues: ZodIssue[] }` — invalid query params
- `400 { error: "invalid_params", issues: ZodIssue[] }` — invalid path params
- `404 { error: "not_found" }` — resource missing
- `500 { error: "internal_error", message: string }` — unhandled server error
