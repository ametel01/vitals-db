import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows, classifyTrend } from "./composite_windows";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

interface EconomyAverages {
  avgSpeed: number | null;
  avgPower: number | null;
  avgHr: number | null;
  avgVerticalOscillation: number | null;
  avgGroundContactTime: number | null;
  avgStrideLength: number | null;
}

export async function getRunEconomyScore(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [current, baseline] = await Promise.all([
    getEconomyAverages(db, windows.current),
    getEconomyAverages(db, windows.baseline),
  ]);
  const currentSpeedPerWatt = ratio(current.avgSpeed, current.avgPower);
  const baselineSpeedPerWatt = ratio(baseline.avgSpeed, baseline.avgPower);
  const currentSpeedPerBpm = ratio(current.avgSpeed, current.avgHr);
  const baselineSpeedPerBpm = ratio(baseline.avgSpeed, baseline.avgHr);
  const currentPenalty = mechanicsPenalty(current);
  const baselinePenalty = mechanicsPenalty(baseline);
  const speedPerWattTrend = classifyTrend(currentSpeedPerWatt, baselineSpeedPerWatt, {
    higherIsBetter: true,
  });
  const speedPerBpmTrend = classifyTrend(currentSpeedPerBpm, baselineSpeedPerBpm, {
    higherIsBetter: true,
  });
  const mechanicsTrend = classifyTrend(currentPenalty, baselinePenalty, { higherIsBetter: false });
  const driver = economyDriver(
    speedPerWattTrend.direction,
    speedPerBpmTrend.direction,
    mechanicsTrend.direction,
    currentPenalty - baselinePenalty,
  );
  const sampleQuality = current.avgSpeed === null || current.avgHr === null ? "poor" : "high";

  return CompositeResultSchema.parse({
    answer: `Run economy change is driven by ${driver}`,
    evidence: [
      {
        label: "Speed per watt",
        value: formatRatioDelta(speedPerWattTrend.delta),
        detail: `Current ${formatRatio(currentSpeedPerWatt)} vs baseline ${formatRatio(
          baselineSpeedPerWatt,
        )}.`,
      },
      {
        label: "Speed per bpm",
        value: formatRatioDelta(speedPerBpmTrend.delta),
        detail: `Current ${formatRatio(currentSpeedPerBpm)} vs baseline ${formatRatio(
          baselineSpeedPerBpm,
        )}.`,
      },
      {
        label: "Mechanics penalty",
        value: Number(currentPenalty.toFixed(1)),
        detail: `Baseline penalty ${baselinePenalty.toFixed(1)} from vertical oscillation, ground contact, and stride length.`,
      },
      {
        label: "Output",
        value: formatNumber(current.avgPower, " W"),
        detail: `Average speed ${formatNumber(current.avgSpeed, " m/s")} and HR ${formatNumber(
          current.avgHr,
          " bpm",
        )}.`,
      },
    ],
    action: actionForDriver(driver),
    confidence: sampleQuality === "high" ? "high" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

async function getEconomyAverages(db: Db, range: DateRange): Promise<EconomyAverages> {
  const upper = normalizeRangeEnd(range.to);
  const from = normalizeRangeStart(range.from);
  const row = await db.get<EconomyAverages>(
    `WITH scoped_workouts AS (
       SELECT start_ts, end_ts
       FROM workouts
       WHERE type = 'Running' AND start_ts >= ? AND start_ts ${upper.operator} ?
     )
     SELECT
       (SELECT AVG(p.speed)
        FROM performance p
        JOIN scoped_workouts w ON p.ts BETWEEN w.start_ts AND w.end_ts
        WHERE p.speed IS NOT NULL) AS avgSpeed,
       (SELECT AVG(p.power)
        FROM performance p
        JOIN scoped_workouts w ON p.ts BETWEEN w.start_ts AND w.end_ts
        WHERE p.power IS NOT NULL) AS avgPower,
       (SELECT AVG(hr.bpm)
        FROM heart_rate hr
        JOIN scoped_workouts w ON hr.ts BETWEEN w.start_ts AND w.end_ts) AS avgHr,
       (SELECT AVG(p.vertical_oscillation_cm)
        FROM performance p
        JOIN scoped_workouts w ON p.ts BETWEEN w.start_ts AND w.end_ts
        WHERE p.vertical_oscillation_cm IS NOT NULL) AS avgVerticalOscillation,
       (SELECT AVG(p.ground_contact_time_ms)
        FROM performance p
        JOIN scoped_workouts w ON p.ts BETWEEN w.start_ts AND w.end_ts
        WHERE p.ground_contact_time_ms IS NOT NULL) AS avgGroundContactTime,
       (SELECT AVG(p.stride_length_m)
        FROM performance p
        JOIN scoped_workouts w ON p.ts BETWEEN w.start_ts AND w.end_ts
        WHERE p.stride_length_m IS NOT NULL) AS avgStrideLength`,
    [from, upper.value],
  );
  return {
    avgSpeed: row?.avgSpeed ?? null,
    avgPower: row?.avgPower ?? null,
    avgHr: row?.avgHr ?? null,
    avgVerticalOscillation: row?.avgVerticalOscillation ?? null,
    avgGroundContactTime: row?.avgGroundContactTime ?? null,
    avgStrideLength: row?.avgStrideLength ?? null,
  };
}

function mechanicsPenalty(input: EconomyAverages): number {
  return (
    positiveDelta(input.avgVerticalOscillation, 10) +
    positiveDelta(input.avgGroundContactTime, 300) / 20 +
    positiveDelta(1.0, input.avgStrideLength) * 10
  );
}

function economyDriver(
  speedPerWatt: string,
  speedPerBpm: string,
  mechanics: string,
  mechanicsPenaltyDelta: number,
): string {
  if (mechanics === "declining" || mechanicsPenaltyDelta >= 1) return "mechanics";
  if (speedPerWatt === "improving" && speedPerBpm === "improving") return "fitness";
  if (speedPerWatt === "declining" && speedPerBpm !== "improving") return "output";
  return "mixed economy";
}

function actionForDriver(driver: string): CompositeResult["action"] {
  if (driver === "mechanics") {
    return {
      kind: "watch",
      recommendation: "Review mechanics before interpreting speed changes as fitness.",
    };
  }
  if (driver === "output") {
    return {
      kind: "maintain",
      recommendation: "Separate harder output from true economy gains in the next comparison.",
    };
  }
  return {
    kind: "maintain",
    recommendation: "Keep comparing similar running conditions before changing training.",
  };
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function positiveDelta(value: number | null, threshold: number | null): number {
  if (value === null || threshold === null) return 0;
  return Math.max(0, value - threshold);
}

function formatRatio(value: number | null): string {
  if (value === null) return "unknown";
  return value.toFixed(4);
}

function formatRatioDelta(value: number | null): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(4)}`;
}

function formatNumber(value: number | null, unit: string): string | null {
  if (value === null) return null;
  return `${value.toFixed(1)}${unit}`;
}
