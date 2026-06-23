# @vitals/web

Dashboard frontend for `vitals-db`, built with Next.js App Router and powered by the local Hono API.

## Development setup

From the repository root:

```bash
bun install
bun run --filter @vitals/web dev
```

Environment defaults:

- `VITALS_API_URL`: `http://127.0.0.1:8787`
- `NODE_ENV`: development unless overridden

## Local script flow

- Run the API server in one terminal with `bun run health serve`.
- Run the web app in a second terminal with `bun run --filter @vitals/web dev`.
- Open `http://localhost:3000` for the dashboard.

## Route coverage

- `/` — recovery dashboard with KPI cards, recovery snapshot, workout summary, and trend charts
- `/performance` — performance model dashboard and benchmark diagnostics
- `/sleep` — sleep score, consistency, stage lanes, and recent-night detail
- `/workouts` — paginated workout list and filters
- `/workouts/:id` — workout detail, including drift, load, Z2 share, and HR zones
- `/workouts/:id/stats` — workout-level Apple metric aggregates
- `/workouts/:id/events` — workout event and segment timeline
- `/workouts/:id/metadata` — workout metadata records
- `/workouts/:id/routes` — route file references for workout mapping data

## Feature notes

- API data is read through `apps/web/lib/api.ts` with strict schema decode.
- Dashboard helpers used by `/`, `/performance`, and `/sleep` are intentionally split into `apps/web/lib/*-dashboard.ts` files for testability.
- Legacy derived activity fallback remains in helper logic for compatibility in edge ranges where `/metrics/activity` is not available.

## Testing

```bash
bun test apps/web/lib/__tests__
```

The test suite includes shared helper coverage for:

- overview metrics helpers (`apps/web/lib/__tests__/overview-dashboard.test.ts`)
- performance model helpers (`apps/web/lib/__tests__/performance-dashboard.test.ts`)
- sleep-performance helper behavior and comparison math

