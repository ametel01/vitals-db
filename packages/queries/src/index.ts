export type { DateRange } from "./dates";
export { getAerobicEfficiencyTrend } from "./aerobic_efficiency_trend";
export {
  buildCompositeWindows,
  classifyTrend,
  type CompositeWindows,
  type TrendClassification,
  type TrendDirection,
  type TrendOptions,
} from "./composite_windows";
export {
  getWorkoutDetail,
  getWorkoutSummary,
  type ListWorkoutsParams,
  listWorkouts,
} from "./workouts";
export { getWorkoutHR } from "./workout_hr";
export {
  getWorkoutZoneBreakdown,
  getWorkoutZones,
  getZones,
  getZoneTimeDistribution,
} from "./zones";
export { getWorkoutDrift, type WorkoutDrift } from "./drift";
export { getSleepSummary } from "./sleep";
export { getSleepNightly } from "./sleep_nightly";
export { getSleepNights } from "./sleep_nights";
export { getSleepSegments } from "./sleep_segments";
export { getRestingHRDaily } from "./resting_hr";
export { getRestingHRRolling7d } from "./resting_hr_rolling";
export { getWeeklyActivity } from "./activity";
export { getVO2MaxDaily } from "./vo2max";
export { getHRVDaily } from "./hrv";
export { getWalkingHRDaily } from "./walking_hr";
export { getSpeedDaily } from "./speed";
export { getPowerDaily } from "./power";
export { getReadinessScore } from "./readiness";
export { getRunningDynamicsDaily } from "./running_dynamics";
export { getTrainingStrainVsRecovery } from "./training_strain";
export { getStepsDaily } from "./steps";
export { getDistanceDaily } from "./distance";
export { getEnergyDaily } from "./energy";
export { getLoadForRange, getWorkoutLoad } from "./load";
export { getWorkoutEfficiency, type WorkoutEfficiencyParams } from "./efficiency";
export { getWorkoutSampleQuality } from "./sample_quality";
export {
  getWorkoutContextSummary,
  getWorkoutEvents,
  getWorkoutMetadata,
  getWorkoutRoutes,
  getWorkoutStats,
} from "./workout_context";
