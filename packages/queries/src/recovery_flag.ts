import { type RecoveryFlag, RecoveryFlagSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows } from "./composite_windows";
import type { DateRange } from "./dates";
import { getAverageHRAtPace } from "./hr_at_pace";
import { getHRVDaily } from "./hrv";
import { getLoadForRange } from "./load";
import { getRestingHRDaily } from "./resting_hr";
import { getSleepSummary } from "./sleep";

export async function getRecoveryFlag(db: Db, range: DateRange): Promise<RecoveryFlag> {
  const windows = buildCompositeWindows(range);
  const [
    currentRhr,
    baselineRhr,
    currentHrv,
    baselineHrv,
    sleepHoursPerDay,
    acuteLoad,
    chronicLoad,
    currentHrAtPace,
    baselineHrAtPace,
  ] = await Promise.all([
    averageRestingHR(db, windows.current),
    averageRestingHR(db, windows.baseline),
    averageHRV(db, windows.current),
    averageHRV(db, windows.baseline),
    currentSleepHoursPerDay(db, windows.current),
    totalLoad(db, windows.acute7d),
    totalLoad(db, windows.chronic28d),
    getAverageHRAtPace(db, windows.current),
    getAverageHRAtPace(db, windows.baseline),
  ]);

  const restingHrDelta = delta(currentRhr, baselineRhr);
  const hrvDelta = delta(currentHrv, baselineHrv);
  const hrAtPaceDelta = delta(currentHrAtPace, baselineHrAtPace);
  const chronicWeeklyLoad = chronicLoad === null ? null : chronicLoad / 4;
  const loadRatio =
    acuteLoad === null || chronicWeeklyLoad === null || chronicWeeklyLoad === 0
      ? null
      : acuteLoad / chronicWeeklyLoad;
  const score = buildRecoveryScore({
    restingHrDelta,
    hrvDelta,
    baselineHrv,
    sleepHoursPerDay,
    loadRatio,
    hrAtPaceDelta,
  });

  return RecoveryFlagSchema.parse({
    flag: score.flag(),
    score: score.value,
    reasons: score.reasons,
    resting_hr_delta_bpm: restingHrDelta,
    hrv_delta_ms: hrvDelta,
    sleep_hours_per_day: sleepHoursPerDay,
    acute_chronic_load_ratio: loadRatio,
    hr_at_pace_delta_bpm: hrAtPaceDelta,
    sample_quality: score.sampleQuality(),
  });
}

interface RecoveryInputs {
  restingHrDelta: number | null;
  hrvDelta: number | null;
  baselineHrv: number | null;
  sleepHoursPerDay: number | null;
  loadRatio: number | null;
  hrAtPaceDelta: number | null;
}

function buildRecoveryScore(input: RecoveryInputs): RecoveryScore {
  const score = new RecoveryScore();
  evaluateRestingHR(score, input.restingHrDelta);
  evaluateHRV(score, input.hrvDelta, input.baselineHrv);
  evaluateSleep(score, input.sleepHoursPerDay);
  evaluateLoad(score, input.loadRatio);
  evaluateHRAtPace(score, input.hrAtPaceDelta);
  finalizeRecoveryScore(score);
  return score;
}

function evaluateRestingHR(score: RecoveryScore, restingHrDelta: number | null): void {
  if (restingHrDelta === null) return;
  score.observe();
  if (restingHrDelta >= 5) score.add(1, "Resting HR is elevated versus baseline.");
}

function evaluateHRV(
  score: RecoveryScore,
  hrvDelta: number | null,
  baselineHrv: number | null,
): void {
  if (hrvDelta === null) return;
  score.observe();
  const hrvPercentDelta =
    baselineHrv === null || baselineHrv === 0 ? null : hrvDelta / Math.abs(baselineHrv);
  if (hrvDelta <= -10 || (hrvPercentDelta !== null && hrvPercentDelta <= -0.1)) {
    score.add(1, "HRV is suppressed versus baseline.");
  }
}

function evaluateSleep(score: RecoveryScore, sleepHoursPerDay: number | null): void {
  if (sleepHoursPerDay === null) return;
  score.observe();
  if (sleepHoursPerDay < 5) {
    score.add(2, "Sleep is severely short.");
  } else if (sleepHoursPerDay < 7) {
    score.add(1, "Sleep is below the recovery target.");
  }
}

function evaluateLoad(score: RecoveryScore, loadRatio: number | null): void {
  if (loadRatio === null) return;
  score.observe();
  if (loadRatio > 1.5) {
    score.add(2, "Acute training load is far above chronic load.");
  } else if (loadRatio > 1.3) {
    score.add(1, "Acute training load is above chronic load.");
  }
}

function evaluateHRAtPace(score: RecoveryScore, hrAtPaceDelta: number | null): void {
  if (hrAtPaceDelta === null) return;
  score.observe();
  if (hrAtPaceDelta >= 5) score.add(1, "Heart rate is higher at the same running pace.");
}

function finalizeRecoveryScore(score: RecoveryScore): void {
  if (score.observedSignals === 0) {
    score.add(1, "Not enough recovery data is available.");
  } else if (score.reasons.length === 0) {
    score.reasons.push("Recovery markers are within baseline range.");
  }
}

class RecoveryScore {
  value = 0;
  observedSignals = 0;
  reasons: string[] = [];

  observe(): void {
    this.observedSignals += 1;
  }

  add(points: number, reason: string): void {
    this.value += points;
    this.reasons.push(reason);
  }

  flag(): RecoveryFlag["flag"] {
    if (this.value >= 3) return "red";
    if (this.value >= 1) return "yellow";
    return "green";
  }

  sampleQuality(): RecoveryFlag["sample_quality"] {
    if (this.observedSignals >= 4) return "high";
    if (this.observedSignals >= 2) return "mixed";
    return "poor";
  }
}

async function averageRestingHR(db: Db, range: DateRange): Promise<number | null> {
  return average((await getRestingHRDaily(db, range)).map((row) => row.avg_rhr));
}

async function averageHRV(db: Db, range: DateRange): Promise<number | null> {
  return average((await getHRVDaily(db, range)).map((row) => row.avg_hrv));
}

async function currentSleepHoursPerDay(db: Db, range: DateRange): Promise<number | null> {
  const summary = await getSleepSummary(db, range);
  return summary.total_hours === 0 ? null : summary.total_hours / rangeDays(range);
}

async function totalLoad(db: Db, range: DateRange): Promise<number | null> {
  const values = (await getLoadForRange(db, range))
    .map((row) => row.load)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function delta(current: number | null, baseline: number | null): number | null {
  return current === null || baseline === null ? null : current - baseline;
}

function rangeDays(range: DateRange): number {
  const from = Date.parse(`${range.from.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${range.to.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}
