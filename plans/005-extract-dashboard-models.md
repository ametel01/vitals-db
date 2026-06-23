# Plan 005: Extract dashboard page models and add characterization tests

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/web/app/(dashboard)/page.tsx apps/web/app/performance/page.tsx apps/web/lib/sleep-dashboard.ts apps/web/lib/__tests__/sleep-dashboard.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

The overview and performance dashboard pages are large modules that mix server data fetching, transformation, rendering, labels, thresholds, and inline icons. They are also recent churn hotspots. The sleep page already has extracted pure model logic in `apps/web/lib/sleep-dashboard.ts` with focused tests; applying the same pattern to overview and performance lowers regression risk before future UI changes.

## Current state

- `apps/web/app/(dashboard)/page.tsx` is 1538 lines and contains page fetching plus many model helper functions.
- `apps/web/app/performance/page.tsx` is 1476 lines and already has a `buildDashboardModel` function inside the page module.
- `apps/web/lib/sleep-dashboard.ts` is the local exemplar for extracted dashboard logic and test coverage.

Current excerpt from `apps/web/app/performance/page.tsx:158`:

```tsx
export default async function PerformancePage(): Promise<React.ReactElement> {
  const to = todayIso();
  const chartFrom = windowStartIso(CHART_WINDOW_DAYS);

  const [
    reportResult,
    rollingResult,
    vo2Result,
    hrvResult,
    speedResult,
    powerResult,
    dynamicsResult,
    loadResult,
    zoneTimeResult,
    weeklyZ2Result,
    hrAtPaceResult,
    recoveryTimesResult,
    performanceRunsResult,
  ] = await Promise.all([
```

Current excerpt from `apps/web/app/performance/page.tsx:289`:

```tsx
function buildDashboardModel({
  chartFrom,
  to,
  reportResult,
  rollingResult,
  vo2Result,
  hrvResult,
  dynamicsResult,
  loadResult,
  zoneTimeResult,
  recoveryTimesResult,
  runRows,
}: {
```

Sleep model exemplar from `apps/web/lib/sleep-dashboard.ts:85`:

```ts
export function buildSleepDashboardModel({
  currentNights,
  currentSegments,
  priorNights,
  priorSegments,
}: {
  currentNights: SleepNightDetail[];
  currentSegments: SleepSegment[];
  priorNights: SleepNightDetail[];
  priorSegments: SleepSegment[];
}): SleepDashboardModel {
```

Repo conventions to match:

- Pure web transformation logic belongs in `apps/web/lib/*.ts`.
- Tests belong in `apps/web/lib/__tests__/*.test.ts`.
- Page components should keep fetching and JSX; pure model builders should not import React.
- The web app uses Next.js 16. Read `apps/web/AGENTS.md` before changing Next page code.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web lib tests | `bun test apps/web/lib/__tests__` | exit 0 |
| Focused tests | `bun test apps/web/lib/__tests__/overview-dashboard.test.ts apps/web/lib/__tests__/performance-dashboard.test.ts` | exit 0 after files exist |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored build metadata |
| Web build | `bun run build:web` | exit 0; writes ignored `.next` artifacts |

## Scope

**In scope**:

- `apps/web/app/(dashboard)/page.tsx`
- `apps/web/app/performance/page.tsx`
- `apps/web/lib/overview-dashboard.ts` (create)
- `apps/web/lib/performance-dashboard.ts` (create)
- `apps/web/lib/__tests__/overview-dashboard.test.ts` (create)
- `apps/web/lib/__tests__/performance-dashboard.test.ts` (create)

**Out of scope**:

- Visual redesign.
- CSS changes unless import extraction forces a tiny class-name fix.
- Sleep dashboard logic beyond using it as a pattern.
- API client changes.
- Replacing inline icons with an icon library.

## Git workflow

- Branch: `advisor/005-extract-dashboard-models`
- Commit message style: `refactor(web): extract dashboard model builders`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Extract performance model types and pure helpers

Create `apps/web/lib/performance-dashboard.ts`. Move these from `apps/web/app/performance/page.tsx` when they do not need React:

- model interfaces such as `InsightCardModel`, `MetricSparklineModel`, `BenchmarkRow`, `GuidanceModel`, `DashboardModel`, `ZoneBarRow`
- `buildDashboardModel`
- helper functions used only by the model builder, such as `buildForecast`, `buildInsightCards`, `buildMetricCards`, `buildPrimaryInsight`, `buildCardiacFlags`, `buildMechanics`, `buildZoneShare`, `buildRecoveryOverlap`, `buildBenchmarkRows`, `buildGuidance`, and formatting helpers that do not return JSX

Keep React components, icons, and CSS class decisions in the page file. Export only the functions/types the page and tests need.

**Verify**: `bun run check:ci` -> imports are organized and no unused symbols remain.

### Step 2: Add performance model characterization tests

Create `apps/web/lib/__tests__/performance-dashboard.test.ts`. Use small hand-built DTO-shaped fixtures and `FetchResult` values to test:

- fallback model when report data is unavailable
- forecast/action tone selection from a composite report
- benchmark row creation from performance run rows
- zone share computation from zone-time rows

Keep tests about pure values, not rendered JSX.

**Verify**: `bun test apps/web/lib/__tests__/performance-dashboard.test.ts` -> exit 0.

### Step 3: Extract overview model helpers

Create `apps/web/lib/overview-dashboard.ts`. Move pure helpers from `apps/web/app/(dashboard)/page.tsx` that compute metric displays, series, trend summaries, weekly activity fallback, workout breakdowns, and status labels. Keep the page's JSX components in the page file.

Good candidates from the current page include helpers after `MetricDisplay`, such as:

- `buildMetricFromPoints`
- `buildMetricFromDailyValues`
- `dailyValuePoints`
- `makeSeries`
- `metricSummary`
- `formatValue`
- `formatDelta`
- `formatNullableDelta`
- `flagTone`
- `statusFromDelta`
- `sleepStatusFromFlag`
- `loadStatusFromFlag`
- `scoreLabel`
- `resolveWeeklyActivity`
- `activityBreakdown`

Do not attempt to split every component in this plan. Keep the change focused on pure data/model extraction plus tests.

**Verify**: `bun run check:ci` -> exit 0.

### Step 4: Add overview model characterization tests

Create `apps/web/lib/__tests__/overview-dashboard.test.ts`. Cover:

- metric trend status for higher-is-better and lower-is-better metrics
- weekly activity fallback from workouts when API activity fails
- activity breakdown grouping by workout type
- recovery flag label/tone mapping

Use existing test style from `apps/web/lib/__tests__/sleep-dashboard.test.ts`.

**Verify**: `bun test apps/web/lib/__tests__/overview-dashboard.test.ts` -> exit 0.

### Step 5: Re-run page-level verification

After extraction, run TypeScript and the Next build. Fix import/export issues without changing UI behavior.

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run build:web` -> exit 0

## Test plan

- Add two new pure-model test files.
- Keep `sleep-dashboard.test.ts` passing.
- Run all web lib tests, full tests, typecheck, and web build.

## Done criteria

- [ ] `apps/web/app/performance/page.tsx` imports pure model builders from `apps/web/lib/performance-dashboard.ts`.
- [ ] `apps/web/app/(dashboard)/page.tsx` imports pure helpers from `apps/web/lib/overview-dashboard.ts`.
- [ ] New performance model tests cover fallback and non-empty report cases.
- [ ] New overview model tests cover metric trend and activity fallback behavior.
- [ ] No public UI route or API response shape changes.
- [ ] `bun test apps/web/lib/__tests__` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run build:web` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Extracting pure helpers requires changing JSX output or CSS classes.
- Next.js page semantics change because code is moved into a client module.
- The extracted helpers need React imports.
- The page files have drifted so the named helper functions no longer exist.

## Maintenance notes

This plan is a characterization refactor, not a redesign. Reviewers should compare rendered pages manually only as a sanity check; the main review focus is that model behavior is preserved and future dashboard changes can be tested without loading a Next page.
