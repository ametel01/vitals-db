import type { Db } from "@vitals/db";
import {
  type DateRange,
  getAdvancedCompositeReport,
  getAerobicEfficiencyTrend,
  getConsistencyIndex,
  getDistanceDaily,
  getEnergyDaily,
  getFitnessTrend,
  getHRVDaily,
  getLoadForRange,
  getLoadQuality,
  getPowerDaily,
  getReadinessScore,
  getRecoveryDebt,
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
  getZoneTimeDistribution,
  getZones,
  listRunFatigueFlags,
} from "@vitals/queries";
import { Hono } from "hono";
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

const RangeSchema = z.object({
  from: DateInputSchema,
  to: DateInputSchema,
});

function parseRange(raw: Record<string, string>): DateRange | { error: z.ZodIssue[] } {
  const result = RangeSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues };
  return result.data;
}

export function metricsRouter(db: Db): Hono {
  const app = new Hono();

  app.get("/zones", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getZones(db, parsed));
  });

  app.get("/zones/time", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getZoneTimeDistribution(db, parsed));
  });

  app.get("/resting-hr", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRestingHRDaily(db, parsed));
  });

  app.get("/resting-hr/rolling", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRestingHRRolling7d(db, parsed));
  });

  app.get("/sleep", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSleepSummary(db, parsed));
  });

  app.get("/sleep/nightly", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSleepNightly(db, parsed));
  });

  app.get("/sleep/nights", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSleepNights(db, parsed));
  });

  app.get("/sleep/segments", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSleepSegments(db, parsed));
  });

  app.get("/load", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getLoadForRange(db, parsed));
  });

  app.get("/vo2max", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getVO2MaxDaily(db, parsed));
  });

  app.get("/hrv", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getHRVDaily(db, parsed));
  });

  app.get("/walking-hr", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getWalkingHRDaily(db, parsed));
  });

  app.get("/speed", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSpeedDaily(db, parsed));
  });

  app.get("/power", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getPowerDaily(db, parsed));
  });

  app.get("/running-dynamics", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRunningDynamicsDaily(db, parsed));
  });

  app.get("/activity", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getWeeklyActivity(db, parsed));
  });

  app.get("/steps", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getStepsDaily(db, parsed));
  });

  app.get("/distance", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getDistanceDaily(db, parsed));
  });

  app.get("/energy", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getEnergyDaily(db, parsed));
  });

  app.get("/composites/report", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getAdvancedCompositeReport(db, parsed));
  });

  app.get("/composites/aerobic-efficiency", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getAerobicEfficiencyTrend(db, parsed));
  });

  app.get("/composites/readiness", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getReadinessScore(db, parsed));
  });

  app.get("/composites/training-strain", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getTrainingStrainVsRecovery(db, parsed));
  });

  app.get("/composites/run-fatigue", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await listRunFatigueFlags(db, parsed));
  });

  app.get("/composites/fitness-trend", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getFitnessTrend(db, parsed));
  });

  app.get("/composites/load-quality", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getLoadQuality(db, parsed));
  });

  app.get("/composites/recovery-debt", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRecoveryDebt(db, parsed));
  });

  app.get("/composites/consistency-index", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getConsistencyIndex(db, parsed));
  });

  app.get("/composites/run-economy", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRunEconomyScore(db, parsed));
  });

  return app;
}
