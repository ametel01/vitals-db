import type {
  ActivityPoint,
  AdvancedCompositeReport,
  DistancePoint,
  EnergyPoint,
  HRPoint,
  HRVPoint,
  LoadRow,
  MetricWindowComparison,
  PowerPoint,
  RecoveryFlag,
  RestingHRPoint,
  RestingHRRollingPoint,
  RunFatigueFlag,
  RunningDynamicsPoint,
  SleepNightDetail,
  SleepNightPoint,
  SleepSegment,
  SleepSummary,
  SpeedPoint,
  StepsPoint,
  VO2MaxPoint,
  WalkingHRPoint,
  WeeklyZ2MinutesRow,
  WorkoutDetail,
  WorkoutEfficiency,
  WorkoutEvent,
  WorkoutHRAtPace,
  WorkoutMetadata,
  WorkoutPerformanceRunRow,
  WorkoutRecoveryRow,
  WorkoutRoute,
  WorkoutStat,
  WorkoutSummary,
  WorkoutZoneBreakdownRow,
  ZoneTimeDistributionRow,
  ZonesRow,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import type { DateRange, ListWorkoutsParams } from "@vitals/queries";
import {
  type WorkoutPerformanceRunRowsParams,
  getAdvancedCompositeReport,
  getAerobicEfficiencyTrend,
  getConsistencyIndex,
  getDistanceDaily,
  getEnergyDaily,
  getFitnessTrend,
  getHRAtPaceTrend,
  getHRVDaily,
  getLoadForRange,
  getLoadQuality,
  getMetricWindowComparisons,
  getPowerDaily,
  getReadinessScore,
  getRecoveryDebt,
  getRecoveryFlag,
  getRestingHRDaily,
  getRestingHRRolling7d,
  getRunEconomyScore,
  getRunningDynamicsDaily,
  getSleepNightly,
  getSleepNights,
  getSleepSegments,
  getSleepSummary,
  getSpeedDaily,
  getStepsDaily,
  getTrainingStrainVsRecovery,
  getVO2MaxDaily,
  getWalkingHRDaily,
  getWeeklyActivity,
  getWeeklyZ2Minutes,
  getWorkoutDetail,
  getWorkoutEfficiency,
  getWorkoutEvents,
  getWorkoutHR,
  getWorkoutMetadata,
  getWorkoutPerformanceRunRows,
  getWorkoutRecoveryTimes,
  getWorkoutRoutes,
  getWorkoutStats,
  getWorkoutSummary,
  getWorkoutZoneBreakdown,
  getZoneTimeDistribution,
  getZones,
  listRunFatigueFlags,
  listWorkouts,
} from "@vitals/queries";
import { z } from "zod";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const DateInputSchema = z
  .string()
  .refine(
    (value) =>
      isValidDateOnly(value) || z.string().datetime({ offset: true }).safeParse(value).success,
    {
      message: "Expected YYYY-MM-DD or an ISO 8601 datetime with timezone offset",
    },
  );

function dateInputToTime(value: string): number {
  return new Date(isValidDateOnly(value) ? `${value}T00:00:00.000Z` : value).getTime();
}

const BaseRangeSchema = z.object({
  from: DateInputSchema,
  to: DateInputSchema,
});

function isOrderedRange(value: { from: string; to: string }): boolean {
  return dateInputToTime(value.from) <= dateInputToTime(value.to);
}

const RangeSchema = BaseRangeSchema.refine(isOrderedRange, {
  message: "Expected to to be on or after from",
  path: ["to"],
});

const ToDateSchema = z.object({
  to: DateInputSchema,
});

const HRAtPaceQuerySchema = BaseRangeSchema.extend({
  pace_sec_per_km: z.coerce.number().positive().optional(),
  tolerance_sec_per_km: z.coerce.number().nonnegative().optional(),
}).refine(isOrderedRange, {
  message: "Expected to to be on or after from",
  path: ["to"],
});

const WorkoutIdParamsSchema = z.object({
  id: z.string().min(1),
});

const EfficiencyQuerySchema = z
  .object({
    hr_min: z.coerce.number().int().positive().optional(),
    hr_max: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.hr_min === undefined || value.hr_max === undefined || value.hr_max > value.hr_min,
    {
      message: "Expected hr_max to be greater than hr_min",
      path: ["hr_max"],
    },
  );

const ListQuerySchema = z.object({
  type: z.string().min(1).optional(),
  from: DateInputSchema.optional(),
  to: DateInputSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const PerformanceRunsQuerySchema = z
  .object({
    from: DateInputSchema.optional(),
    to: DateInputSchema.optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      isOrderedRange({ from: value.from, to: value.to }),
    {
      message: "Expected to to be on or after from",
      path: ["to"],
    },
  );

type InvalidQuery = { ok: false; error: "invalid_query"; issues: z.ZodIssue[] };
type InvalidParams = { ok: false; error: "invalid_params"; issues: z.ZodIssue[] };
type NotFound = { ok: false; error: "not_found" };
type ServiceOk<T> = { ok: true; data: T };

export type ServiceResult<T> = ServiceOk<T> | InvalidQuery | InvalidParams | NotFound;

export interface VitalsReadService {
  workouts: {
    list(raw: Record<string, string>): Promise<ServiceResult<WorkoutSummary[]>>;
    performanceRuns(
      raw: Record<string, string>,
    ): Promise<ServiceResult<WorkoutPerformanceRunRow[]>>;
    detail(rawId: string): Promise<ServiceResult<WorkoutDetail>>;
    hr(rawId: string): Promise<ServiceResult<HRPoint[]>>;
    zones(rawId: string): Promise<ServiceResult<WorkoutZoneBreakdownRow[]>>;
    efficiency(
      rawId: string,
      raw: Record<string, string>,
    ): Promise<ServiceResult<WorkoutEfficiency>>;
    stats(rawId: string): Promise<ServiceResult<WorkoutStat[]>>;
    events(rawId: string): Promise<ServiceResult<WorkoutEvent[]>>;
    metadata(rawId: string): Promise<ServiceResult<WorkoutMetadata[]>>;
    routes(rawId: string): Promise<ServiceResult<WorkoutRoute[]>>;
  };
  metrics: {
    zones(raw: Record<string, string>): Promise<ServiceResult<ZonesRow>>;
    zoneTime(raw: Record<string, string>): Promise<ServiceResult<ZoneTimeDistributionRow[]>>;
    z2Weekly(raw: Record<string, string>): Promise<ServiceResult<WeeklyZ2MinutesRow[]>>;
    restingHr(raw: Record<string, string>): Promise<ServiceResult<RestingHRPoint[]>>;
    restingHrRolling(raw: Record<string, string>): Promise<ServiceResult<RestingHRRollingPoint[]>>;
    sleep(raw: Record<string, string>): Promise<ServiceResult<SleepSummary>>;
    sleepNightly(raw: Record<string, string>): Promise<ServiceResult<SleepNightPoint[]>>;
    sleepNights(raw: Record<string, string>): Promise<ServiceResult<SleepNightDetail[]>>;
    sleepSegments(raw: Record<string, string>): Promise<ServiceResult<SleepSegment[]>>;
    load(raw: Record<string, string>): Promise<ServiceResult<LoadRow[]>>;
    recoveryTimes(raw: Record<string, string>): Promise<ServiceResult<WorkoutRecoveryRow[]>>;
    hrAtPace(raw: Record<string, string>): Promise<ServiceResult<WorkoutHRAtPace[]>>;
    vo2max(raw: Record<string, string>): Promise<ServiceResult<VO2MaxPoint[]>>;
    hrv(raw: Record<string, string>): Promise<ServiceResult<HRVPoint[]>>;
    walkingHr(raw: Record<string, string>): Promise<ServiceResult<WalkingHRPoint[]>>;
    speed(raw: Record<string, string>): Promise<ServiceResult<SpeedPoint[]>>;
    power(raw: Record<string, string>): Promise<ServiceResult<PowerPoint[]>>;
    runningDynamics(raw: Record<string, string>): Promise<ServiceResult<RunningDynamicsPoint[]>>;
    activity(raw: Record<string, string>): Promise<ServiceResult<ActivityPoint[]>>;
    steps(raw: Record<string, string>): Promise<ServiceResult<StepsPoint[]>>;
    distance(raw: Record<string, string>): Promise<ServiceResult<DistancePoint[]>>;
    energy(raw: Record<string, string>): Promise<ServiceResult<EnergyPoint[]>>;
    dailyComparison(raw: Record<string, string>): Promise<ServiceResult<MetricWindowComparison[]>>;
    recoveryFlag(raw: Record<string, string>): Promise<ServiceResult<RecoveryFlag>>;
    compositesReport(raw: Record<string, string>): Promise<ServiceResult<AdvancedCompositeReport>>;
    compositesAerobicEfficiency(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesReadiness(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesTrainingStrain(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesRunFatigue(raw: Record<string, string>): Promise<ServiceResult<RunFatigueFlag[]>>;
    compositesFitnessTrend(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesLoadQuality(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesRecoveryDebt(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesConsistencyIndex(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
    compositesRunEconomy(
      raw: Record<string, string>,
    ): Promise<ServiceResult<import("@vitals/core").CompositeResult>>;
  };
}

function invalidQuery(issues: z.ZodIssue[]): InvalidQuery {
  return { ok: false, error: "invalid_query", issues };
}

function invalidParams(issues: z.ZodIssue[]): InvalidParams {
  return { ok: false, error: "invalid_params", issues };
}

function parseRange(raw: Record<string, string>): DateRange | InvalidQuery {
  const result = RangeSchema.safeParse(raw);
  return result.success ? result.data : invalidQuery(result.error.issues);
}

function parseId(rawId: string): { id: string } | InvalidParams {
  const result = WorkoutIdParamsSchema.safeParse({ id: rawId });
  return result.success ? result.data : invalidParams(result.error.issues);
}

async function ensureWorkoutExists(db: Db, workoutId: string): Promise<NotFound | null> {
  const workout = await getWorkoutSummary(db, workoutId);
  return workout === null ? { ok: false, error: "not_found" } : null;
}

export function createVitalsReadService(db: Db): VitalsReadService {
  return {
    workouts: {
      async list(raw) {
        const parsed = ListQuerySchema.safeParse(raw);
        if (!parsed.success) return invalidQuery(parsed.error.issues);
        const params: ListWorkoutsParams = {};
        if (parsed.data.type !== undefined) params.type = parsed.data.type;
        if (parsed.data.from !== undefined) params.from = parsed.data.from;
        if (parsed.data.to !== undefined) params.to = parsed.data.to;
        if (parsed.data.limit !== undefined) params.limit = parsed.data.limit;
        if (parsed.data.offset !== undefined) params.offset = parsed.data.offset;
        return { ok: true, data: await listWorkouts(db, params) };
      },
      async performanceRuns(raw) {
        const parsed = PerformanceRunsQuerySchema.safeParse(raw);
        if (!parsed.success) return invalidQuery(parsed.error.issues);
        const params: WorkoutPerformanceRunRowsParams = {};
        if (parsed.data.from !== undefined) params.from = parsed.data.from;
        if (parsed.data.to !== undefined) params.to = parsed.data.to;
        if (parsed.data.limit !== undefined) params.limit = parsed.data.limit;
        return { ok: true, data: await getWorkoutPerformanceRunRows(db, params) };
      },
      async detail(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const detail = await getWorkoutDetail(db, parsed.id);
        return detail === null ? { ok: false, error: "not_found" } : { ok: true, data: detail };
      },
      async hr(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutHR(db, parsed.id) };
      },
      async zones(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutZoneBreakdown(db, parsed.id) };
      },
      async efficiency(rawId, raw) {
        const parsedId = parseId(rawId);
        if ("ok" in parsedId) return parsedId;
        const parsedQuery = EfficiencyQuerySchema.safeParse(raw);
        if (!parsedQuery.success) return invalidQuery(parsedQuery.error.issues);
        const missing = await ensureWorkoutExists(db, parsedId.id);
        if (missing) return missing;
        const params: { hrMin?: number; hrMax?: number } = {};
        if (parsedQuery.data.hr_min !== undefined) params.hrMin = parsedQuery.data.hr_min;
        if (parsedQuery.data.hr_max !== undefined) params.hrMax = parsedQuery.data.hr_max;
        const efficiency = await getWorkoutEfficiency(db, parsedId.id, params);
        if (efficiency === null) return { ok: false, error: "not_found" };
        return { ok: true, data: efficiency };
      },
      async stats(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutStats(db, parsed.id) };
      },
      async events(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutEvents(db, parsed.id) };
      },
      async metadata(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutMetadata(db, parsed.id) };
      },
      async routes(rawId) {
        const parsed = parseId(rawId);
        if ("ok" in parsed) return parsed;
        const missing = await ensureWorkoutExists(db, parsed.id);
        if (missing) return missing;
        return { ok: true, data: await getWorkoutRoutes(db, parsed.id) };
      },
    },
    metrics: {
      async zones(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getZones(db, parsed) };
      },
      async zoneTime(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getZoneTimeDistribution(db, parsed) };
      },
      async z2Weekly(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getWeeklyZ2Minutes(db, parsed) };
      },
      async restingHr(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRestingHRDaily(db, parsed) };
      },
      async restingHrRolling(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRestingHRRolling7d(db, parsed) };
      },
      async sleep(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getSleepSummary(db, parsed) };
      },
      async sleepNightly(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getSleepNightly(db, parsed) };
      },
      async sleepNights(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getSleepNights(db, parsed) };
      },
      async sleepSegments(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getSleepSegments(db, parsed) };
      },
      async load(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getLoadForRange(db, parsed) };
      },
      async recoveryTimes(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getWorkoutRecoveryTimes(db, parsed) };
      },
      async hrAtPace(raw) {
        const parsed = HRAtPaceQuerySchema.safeParse(raw);
        if (!parsed.success) return invalidQuery(parsed.error.issues);
        const params: { paceSecPerKm?: number; toleranceSecPerKm?: number } = {};
        if (parsed.data.pace_sec_per_km !== undefined)
          params.paceSecPerKm = parsed.data.pace_sec_per_km;
        if (parsed.data.tolerance_sec_per_km !== undefined) {
          params.toleranceSecPerKm = parsed.data.tolerance_sec_per_km;
        }
        return { ok: true, data: await getHRAtPaceTrend(db, parsed.data, params) };
      },
      async vo2max(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getVO2MaxDaily(db, parsed) };
      },
      async hrv(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getHRVDaily(db, parsed) };
      },
      async walkingHr(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getWalkingHRDaily(db, parsed) };
      },
      async speed(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getSpeedDaily(db, parsed) };
      },
      async power(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getPowerDaily(db, parsed) };
      },
      async runningDynamics(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRunningDynamicsDaily(db, parsed) };
      },
      async activity(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getWeeklyActivity(db, parsed) };
      },
      async steps(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getStepsDaily(db, parsed) };
      },
      async distance(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getDistanceDaily(db, parsed) };
      },
      async energy(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getEnergyDaily(db, parsed) };
      },
      async dailyComparison(raw) {
        const parsed = ToDateSchema.safeParse(raw);
        if (!parsed.success) return invalidQuery(parsed.error.issues);
        return { ok: true, data: await getMetricWindowComparisons(db, parsed.data.to) };
      },
      async recoveryFlag(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRecoveryFlag(db, parsed) };
      },
      async compositesReport(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getAdvancedCompositeReport(db, parsed) };
      },
      async compositesAerobicEfficiency(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getAerobicEfficiencyTrend(db, parsed) };
      },
      async compositesReadiness(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getReadinessScore(db, parsed) };
      },
      async compositesTrainingStrain(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getTrainingStrainVsRecovery(db, parsed) };
      },
      async compositesRunFatigue(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await listRunFatigueFlags(db, parsed) };
      },
      async compositesFitnessTrend(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getFitnessTrend(db, parsed) };
      },
      async compositesLoadQuality(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getLoadQuality(db, parsed) };
      },
      async compositesRecoveryDebt(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRecoveryDebt(db, parsed) };
      },
      async compositesConsistencyIndex(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getConsistencyIndex(db, parsed) };
      },
      async compositesRunEconomy(raw) {
        const parsed = parseRange(raw);
        if ("ok" in parsed) return parsed;
        return { ok: true, data: await getRunEconomyScore(db, parsed) };
      },
    },
  };
}
