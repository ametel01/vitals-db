import { z } from "zod";

const IsoDateTime = z.string().datetime({ offset: true });
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NonNegativeNumber = z.number().finite().nonnegative();
const PositiveNumber = z.number().finite().positive();
const Ratio = z.number().finite().min(0).max(1);

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

export const RestingHRPointSchema = z.object({
  day: IsoDate,
  avg_rhr: PositiveNumber,
});
export type RestingHRPoint = z.infer<typeof RestingHRPointSchema>;

export const SleepSummarySchema = z.object({
  total_hours: NonNegativeNumber,
  consistency_stddev: NonNegativeNumber.nullable(),
  efficiency: Ratio.nullable(),
});
export type SleepSummary = z.infer<typeof SleepSummarySchema>;

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
