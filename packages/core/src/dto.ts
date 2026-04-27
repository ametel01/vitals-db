import { z } from "zod";
import { RawSleepStateSchema, SleepStageDetailSchema, SleepStateSchema } from "./sleep";
import { HR_ZONE_ORDER } from "./zones";

const IsoDateTime = z.string().datetime({ offset: true });
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NonNegativeNumber = z.number().finite().nonnegative();
const NonNegativeInt = z.number().int().nonnegative();
const PositiveNumber = z.number().finite().positive();
const Ratio = z.number().finite().min(0).max(1);

export const HRZoneNameSchema = z.enum(HR_ZONE_ORDER);

export const WorkoutSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  start_ts: IsoDateTime,
  end_ts: IsoDateTime,
  duration_sec: NonNegativeNumber,
  source: z.string().nullable(),
});
export type WorkoutSummary = z.infer<typeof WorkoutSummarySchema>;

export const DriftClassificationSchema = z.enum(["stable", "moderate", "high", "unknown"]);
export type DriftClassification = z.infer<typeof DriftClassificationSchema>;

export const WorkoutDetailSchema = WorkoutSummarySchema.extend({
  drift_pct: z.number().finite().nullable(),
  drift_classification: DriftClassificationSchema,
  load: NonNegativeNumber.nullable(),
  z2_ratio: Ratio.nullable(),
});
export type WorkoutDetail = z.infer<typeof WorkoutDetailSchema>;

export const HRPointSchema = z.object({
  ts: IsoDateTime,
  bpm: PositiveNumber,
  source: z.string().nullable(),
});
export type HRPoint = z.infer<typeof HRPointSchema>;

export const ZonesRowSchema = z.object({
  z2_ratio: Ratio.nullable(),
});
export type ZonesRow = z.infer<typeof ZonesRowSchema>;

// Per-zone breakdown for a single scope (e.g. one workout). Modeled on
// `sample_count` and `ratio` rather than claimed "seconds in zone" because
// the data layer stores discrete HR samples with uneven intervals.
export const WorkoutZoneBreakdownRowSchema = z.object({
  zone: HRZoneNameSchema,
  sample_count: NonNegativeInt,
  ratio: Ratio,
});
export type WorkoutZoneBreakdownRow = z.infer<typeof WorkoutZoneBreakdownRowSchema>;

export const WorkoutZoneBreakdownListSchema = z.array(WorkoutZoneBreakdownRowSchema);
export type WorkoutZoneBreakdownList = z.infer<typeof WorkoutZoneBreakdownListSchema>;

export const ZoneTimeDistributionRowSchema = z.object({
  zone: HRZoneNameSchema,
  duration_sec: NonNegativeNumber,
  ratio: Ratio,
});
export type ZoneTimeDistributionRow = z.infer<typeof ZoneTimeDistributionRowSchema>;

export const ZoneTimeDistributionListSchema = z.array(ZoneTimeDistributionRowSchema);
export type ZoneTimeDistributionList = z.infer<typeof ZoneTimeDistributionListSchema>;

export const RestingHRPointSchema = z.object({
  day: IsoDate,
  avg_rhr: PositiveNumber,
});
export type RestingHRPoint = z.infer<typeof RestingHRPointSchema>;

export const RestingHRRollingPointSchema = z.object({
  day: IsoDate,
  avg_rhr_7d: PositiveNumber,
});
export type RestingHRRollingPoint = z.infer<typeof RestingHRRollingPointSchema>;

export const SleepSummarySchema = z.object({
  total_hours: NonNegativeNumber,
  consistency_stddev: NonNegativeNumber.nullable(),
  efficiency: Ratio.nullable(),
});
export type SleepSummary = z.infer<typeof SleepSummarySchema>;

// One row per night. `day` is the DATE of each night's first `asleep` start
// (UTC). `efficiency` is null when that night has no `in_bed` coverage.
export const SleepNightPointSchema = z.object({
  day: IsoDate,
  asleep_hours: NonNegativeNumber,
  in_bed_hours: NonNegativeNumber,
  efficiency: Ratio.nullable(),
});
export type SleepNightPoint = z.infer<typeof SleepNightPointSchema>;

export const SleepNightDetailSchema = z.object({
  day: IsoDate,
  bedtime: IsoDateTime,
  wake_time: IsoDateTime,
  asleep_hours: NonNegativeNumber,
  in_bed_hours: NonNegativeNumber,
  awake_hours: NonNegativeNumber,
  efficiency: Ratio.nullable(),
  core_hours: NonNegativeNumber.nullable(),
  deep_hours: NonNegativeNumber.nullable(),
  rem_hours: NonNegativeNumber.nullable(),
  unspecified_hours: NonNegativeNumber.nullable(),
});
export type SleepNightDetail = z.infer<typeof SleepNightDetailSchema>;

export const SleepSegmentSchema = z.object({
  night: IsoDate,
  start_ts: IsoDateTime,
  end_ts: IsoDateTime,
  state: SleepStateSchema,
  raw_state: RawSleepStateSchema.nullable(),
  stage: SleepStageDetailSchema.nullable(),
  duration_hours: NonNegativeNumber,
});
export type SleepSegment = z.infer<typeof SleepSegmentSchema>;

export const ActivityPointSchema = z.object({
  week: IsoDate,
  workout_count: z.number().int().nonnegative(),
  total_duration_sec: NonNegativeNumber,
});
export type ActivityPoint = z.infer<typeof ActivityPointSchema>;

export const LoadRowSchema = z.object({
  workout_id: z.string(),
  duration_sec: NonNegativeNumber,
  avg_hr: PositiveNumber.nullable(),
  load: NonNegativeNumber.nullable(),
});
export type LoadRow = z.infer<typeof LoadRowSchema>;

export const VO2MaxPointSchema = z.object({
  day: IsoDate,
  avg_vo2max: PositiveNumber,
});
export type VO2MaxPoint = z.infer<typeof VO2MaxPointSchema>;

export const HRVPointSchema = z.object({
  day: IsoDate,
  avg_hrv: PositiveNumber,
});
export type HRVPoint = z.infer<typeof HRVPointSchema>;

export const WalkingHRPointSchema = z.object({
  day: IsoDate,
  avg_walking_hr: PositiveNumber,
});
export type WalkingHRPoint = z.infer<typeof WalkingHRPointSchema>;

// Running speed stored as m/s (normalized at ingest from km/h when needed).
export const SpeedPointSchema = z.object({
  day: IsoDate,
  avg_speed: NonNegativeNumber,
});
export type SpeedPoint = z.infer<typeof SpeedPointSchema>;

// Running power stored as watts.
export const PowerPointSchema = z.object({
  day: IsoDate,
  avg_power: NonNegativeNumber,
});
export type PowerPoint = z.infer<typeof PowerPointSchema>;

export const RunningDynamicsPointSchema = z.object({
  day: IsoDate,
  avg_vertical_oscillation_cm: NonNegativeNumber.nullable(),
  avg_ground_contact_time_ms: NonNegativeNumber.nullable(),
  avg_stride_length_m: NonNegativeNumber.nullable(),
});
export type RunningDynamicsPoint = z.infer<typeof RunningDynamicsPointSchema>;

export const WorkoutStatSchema = z.object({
  workout_id: z.string(),
  type: z.string(),
  start_ts: IsoDateTime,
  end_ts: IsoDateTime,
  average: z.number().finite().nullable(),
  minimum: z.number().finite().nullable(),
  maximum: z.number().finite().nullable(),
  sum: z.number().finite().nullable(),
  unit: z.string().nullable(),
});
export type WorkoutStat = z.infer<typeof WorkoutStatSchema>;

export const WorkoutEventSchema = z.object({
  workout_id: z.string(),
  type: z.string(),
  ts: IsoDateTime,
  duration_sec: NonNegativeNumber.nullable(),
});
export type WorkoutEvent = z.infer<typeof WorkoutEventSchema>;

export const WorkoutMetadataSchema = z.object({
  workout_id: z.string(),
  key: z.string(),
  value: z.string(),
});
export type WorkoutMetadata = z.infer<typeof WorkoutMetadataSchema>;

export const WorkoutRouteSchema = z.object({
  workout_id: z.string(),
  start_ts: IsoDateTime,
  end_ts: IsoDateTime,
  source: z.string().nullable(),
  path: z.string().nullable(),
});
export type WorkoutRoute = z.infer<typeof WorkoutRouteSchema>;

export const WorkoutPaceAtHRSchema = z.object({
  hr_min: PositiveNumber,
  hr_max: PositiveNumber,
  sample_count: NonNegativeInt,
  avg_speed_mps: NonNegativeNumber.nullable(),
  pace_sec_per_km: PositiveNumber.nullable(),
});
export type WorkoutPaceAtHR = z.infer<typeof WorkoutPaceAtHRSchema>;

export const WorkoutDecouplingSchema = z.object({
  window_duration_sec: NonNegativeNumber,
  sample_count: NonNegativeInt,
  first_half_efficiency: NonNegativeNumber.nullable(),
  second_half_efficiency: NonNegativeNumber.nullable(),
  decoupling_pct: z.number().finite().nullable(),
});
export type WorkoutDecoupling = z.infer<typeof WorkoutDecouplingSchema>;

export const WorkoutEfficiencySchema = z.object({
  pace_at_hr: WorkoutPaceAtHRSchema,
  decoupling: WorkoutDecouplingSchema,
});
export type WorkoutEfficiency = z.infer<typeof WorkoutEfficiencySchema>;

export const StepsPointSchema = z.object({
  day: IsoDate,
  total_steps: NonNegativeNumber,
});
export type StepsPoint = z.infer<typeof StepsPointSchema>;

export const DistancePointSchema = z.object({
  day: IsoDate,
  total_meters: NonNegativeNumber,
});
export type DistancePoint = z.infer<typeof DistancePointSchema>;

export const EnergyPointSchema = z.object({
  day: IsoDate,
  active_kcal: NonNegativeNumber,
  basal_kcal: NonNegativeNumber,
});
export type EnergyPoint = z.infer<typeof EnergyPointSchema>;
