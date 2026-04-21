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

## Error shape

- `400 { error: "invalid_query", issues: ZodIssue[] }` — invalid query params
- `400 { error: "invalid_params", issues: ZodIssue[] }` — invalid path params
- `404 { error: "not_found" }` — resource missing
- `500 { error: "internal_error", message: string }` — unhandled server error
