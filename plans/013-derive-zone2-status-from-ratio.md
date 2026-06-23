# Plan 013: Derive Zone 2 status from the measured ratio

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 1261d71..HEAD -- apps/web/app/performance/page.tsx apps/web/lib/performance-zones.ts apps/web/lib/__tests__/performance-zones.test.ts apps/web/app/globals.css packages/queries/src/zones.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1261d71`, 2026-06-23

## Why this matters

The performance page always labels the Zone 2 summary as `Optimal`, regardless
of the measured Zone 2 ratio. That can turn missing or low Zone 2 data into
incorrect coaching feedback. Derive the displayed status from the actual ratio
and keep the existing measured duration/ratio semantics unchanged.

## Current state

Relevant files:

- `apps/web/app/performance/page.tsx` - renders the Time in zones card.
- `packages/queries/src/zones.ts` - defines time-in-zone ratio semantics.
- `packages/core/src/dto.ts` - DTO type for `ZoneTimeDistributionRow`.
- `apps/web/app/globals.css` - shared `.tag` styles.

Current UI from `apps/web/app/performance/page.tsx:719`:

```tsx
<div className="diagnostic-value">
  <strong>
    {zoneShare.z2Ratio === null ? EMPTY_VALUE : formatPercent(zoneShare.z2Ratio, 0)}
  </strong>
  <span>Zone 2</span>
  <span className="tag success">Optimal</span>
</div>
```

Current model helper from `apps/web/app/performance/page.tsx:1070`:

```ts
function buildZoneShare(
  result: Awaited<ReturnType<typeof getZoneTimeDistribution>>,
): DashboardModel["zoneShare"] {
  if (!result.ok) return { z2Ratio: null, totalDuration: 0, rows: [] };
  const totalDuration = result.data.reduce((sum, row) => sum + row.duration_sec, 0);
  const z2 = result.data.find((row) => row.zone === "Z2") ?? null;
  return {
    z2Ratio: z2?.ratio ?? null,
```

Current query semantics from `packages/queries/src/zones.ts:133`:

```ts
// Time-in-zone is estimated from consecutive HR samples inside workout windows.
// Each interval is attributed to the zone of its starting sample and capped to
// avoid overcounting sparse gaps in HealthKit exports.
```

Existing page precedent from `apps/web/app/performance/page.tsx:1384`:

```ts
if (drift !== null && drift > 10) return "Threshold Intervals";
if (duration >= 5400) return "Long Run";
if (z2 !== null && z2 >= 0.5) return "Zone 2 Run";
if (avgHr !== null && avgHr >= 150) return "Tempo Run";
```

Current tag styles from `apps/web/app/globals.css:1732`:

```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
```

Repo conventions to match:

- Keep pure web helper tests under `apps/web/lib/__tests__/`.
- The UI uses `success`, `warning`, and `danger` tag classes. The base `.tag`
  style is neutral when no tone class is added.
- Preserve the query's capped time-in-zone ratio. Do not switch this card to a
  sample-count ratio.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `bun test apps/web/lib/__tests__/performance-zones.test.ts` | zone status tests pass |
| Lint/check | `bun run check:ci` | exit 0, no warnings |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Full tests | `bun test` | all tests pass |

## Scope

**In scope**:

- `apps/web/app/performance/page.tsx`
- `apps/web/lib/performance-zones.ts` (create if absent)
- `apps/web/lib/__tests__/performance-zones.test.ts` (create if absent)
- `apps/web/app/globals.css` only if a neutral tag class is needed

**Out of scope**:

- Changing HR zone thresholds.
- Changing `packages/queries/src/zones.ts` or DTO schemas.
- Changing weekly Z2 calculation.
- Redesigning the performance dashboard layout.

## Git workflow

- Branch: `advisor/013-derive-zone2-status-from-ratio`
- Commit style: conventional commits, for example
  `fix(web): label detail table headers`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add tests for Zone 2 status classification

Create `apps/web/lib/__tests__/performance-zones.test.ts`.

Expected helper behavior:

- `zone2Status(null)` returns label `No data` and tone `neutral`.
- `zone2Status(0.55)` returns label `High Z2` and tone `success`.
- `zone2Status(0.30)` returns label `Mixed Z2` and tone `warning`.
- `zone2Status(0.10)` returns label `Low Z2` and tone `danger`.

These thresholds intentionally reuse the page's existing `z2 >= 0.5` precedent
for a Zone 2 run. The lower threshold is a conservative UI boundary, not a
change to analytics semantics.

This test should initially fail because the helper does not exist yet.

**Verify**:
`bun test apps/web/lib/__tests__/performance-zones.test.ts` -> fails before
implementation because the helper is missing.

### Step 2: Create a pure Zone 2 status helper

Create `apps/web/lib/performance-zones.ts`.

Suggested API:

```ts
export type Zone2Tone = "success" | "warning" | "danger" | "neutral";

export interface Zone2Status {
  label: string;
  tone: Zone2Tone;
}

export function zone2Status(ratio: number | null): Zone2Status {
  // ...
}
```

Required thresholds:

- `null` or non-finite values -> `No data`, `neutral`.
- `ratio >= 0.5` -> `High Z2`, `success`.
- `ratio >= 0.25` -> `Mixed Z2`, `warning`.
- otherwise -> `Low Z2`, `danger`.

**Verify**:
`bun test apps/web/lib/__tests__/performance-zones.test.ts` -> all tests pass.

### Step 3: Wire the Time in zones card to the helper

Update `apps/web/app/performance/page.tsx`:

- Import `zone2Status` from `@/lib/performance-zones`.
- In `TimeInZonesCard`, derive `const z2Status = zone2Status(zoneShare.z2Ratio);`.
- Replace the hardcoded tag:

```tsx
<span className="tag success">Optimal</span>
```

with a status label based on the helper. For `neutral`, either use the base
`tag` class only or add a `.tag.neutral` style in `globals.css` if you need an
explicit class.

Target shape:

```tsx
<span className={z2Status.tone === "neutral" ? "tag" : `tag ${z2Status.tone}`}>
  {z2Status.label}
</span>
```

**Verify**:
`rg -n 'Optimal|zone2Status' apps/web/app/performance/page.tsx apps/web/lib/performance-zones.ts`
-> shows `zone2Status` usage and no `Optimal` text in the performance page.

### Step 4: Run final verification

Run:

```bash
bun test apps/web/lib/__tests__/performance-zones.test.ts
bun run check:ci
bun run typecheck
bun test
```

Expected result: every command exits 0.

## Test plan

- New `apps/web/lib/__tests__/performance-zones.test.ts` covers null, high,
  mixed, and low Zone 2 ratios.
- Existing query tests under `packages/queries/src/__tests__/zones.test.ts`
  continue to cover time-in-zone rows and ratios.
- Final verification runs the focused helper test plus repo lint, typecheck,
  and full tests.

## Done criteria

- [ ] The performance page no longer hardcodes `Optimal` for every Zone 2
  ratio.
- [ ] Zone 2 status is derived by a tested pure helper.
- [ ] `bun test apps/web/lib/__tests__/performance-zones.test.ts` exits 0.
- [ ] `bun run check:ci`, `bun run typecheck`, and `bun test` exit 0.
- [ ] No analytics query or DTO files are modified.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Plan 005 has already moved `TimeInZonesCard` or `buildZoneShare` into another
  file and the current excerpts no longer match.
- A product owner rejects the proposed `High/Mixed/Low` labels and requests a
  different coaching vocabulary.
- The fix appears to require changing zone thresholds or query semantics.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- This plan intentionally changes only presentation. It should not alter the
  capped time-in-zone query.
- Reviewers should check that missing data does not display as a positive
  coaching status.
- If future product work adds user-configurable zone targets, move the
  thresholds into that settings layer instead of hardcoding more UI rules.
