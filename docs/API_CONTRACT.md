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

## Error shape

- `400 { error: "invalid_query", issues: ZodIssue[] }` — invalid query params
- `400 { error: "invalid_params", issues: ZodIssue[] }` — invalid path params
- `404 { error: "not_found" }` — resource missing
- `500 { error: "internal_error", message: string }` — unhandled server error
