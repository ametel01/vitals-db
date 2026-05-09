import { type Context, Hono } from "hono";
import type { ServiceResult, VitalsReadService } from "../services/read-service";

function toHttp<T>(c: Context, result: ServiceResult<T>) {
  if (result.ok) {
    return c.json(result.data as Record<string, unknown> | unknown[]);
  }
  if (result.error === "not_found") {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ error: result.error, issues: result.issues }, 400);
}

export function metricsRouter(service: VitalsReadService): Hono {
  const app = new Hono();

  app.get("/zones", async (c) => toHttp(c, await service.metrics.zones(c.req.query())));
  app.get("/zones/time", async (c) => toHttp(c, await service.metrics.zoneTime(c.req.query())));
  app.get("/zones/z2-weekly", async (c) =>
    toHttp(c, await service.metrics.z2Weekly(c.req.query())),
  );
  app.get("/resting-hr", async (c) => toHttp(c, await service.metrics.restingHr(c.req.query())));
  app.get("/resting-hr/rolling", async (c) =>
    toHttp(c, await service.metrics.restingHrRolling(c.req.query())),
  );
  app.get("/sleep", async (c) => toHttp(c, await service.metrics.sleep(c.req.query())));
  app.get("/sleep/nightly", async (c) =>
    toHttp(c, await service.metrics.sleepNightly(c.req.query())),
  );
  app.get("/sleep/nights", async (c) =>
    toHttp(c, await service.metrics.sleepNights(c.req.query())),
  );
  app.get("/sleep/segments", async (c) =>
    toHttp(c, await service.metrics.sleepSegments(c.req.query())),
  );
  app.get("/load", async (c) => toHttp(c, await service.metrics.load(c.req.query())));
  app.get("/recovery-times", async (c) =>
    toHttp(c, await service.metrics.recoveryTimes(c.req.query())),
  );
  app.get("/hr-at-pace", async (c) => toHttp(c, await service.metrics.hrAtPace(c.req.query())));
  app.get("/vo2max", async (c) => toHttp(c, await service.metrics.vo2max(c.req.query())));
  app.get("/hrv", async (c) => toHttp(c, await service.metrics.hrv(c.req.query())));
  app.get("/walking-hr", async (c) => toHttp(c, await service.metrics.walkingHr(c.req.query())));
  app.get("/speed", async (c) => toHttp(c, await service.metrics.speed(c.req.query())));
  app.get("/power", async (c) => toHttp(c, await service.metrics.power(c.req.query())));
  app.get("/running-dynamics", async (c) =>
    toHttp(c, await service.metrics.runningDynamics(c.req.query())),
  );
  app.get("/activity", async (c) => toHttp(c, await service.metrics.activity(c.req.query())));
  app.get("/steps", async (c) => toHttp(c, await service.metrics.steps(c.req.query())));
  app.get("/distance", async (c) => toHttp(c, await service.metrics.distance(c.req.query())));
  app.get("/energy", async (c) => toHttp(c, await service.metrics.energy(c.req.query())));
  app.get("/daily-comparison", async (c) =>
    toHttp(c, await service.metrics.dailyComparison(c.req.query())),
  );
  app.get("/recovery-flag", async (c) =>
    toHttp(c, await service.metrics.recoveryFlag(c.req.query())),
  );
  app.get("/composites/report", async (c) =>
    toHttp(c, await service.metrics.compositesReport(c.req.query())),
  );
  app.get("/composites/aerobic-efficiency", async (c) =>
    toHttp(c, await service.metrics.compositesAerobicEfficiency(c.req.query())),
  );
  app.get("/composites/readiness", async (c) =>
    toHttp(c, await service.metrics.compositesReadiness(c.req.query())),
  );
  app.get("/composites/training-strain", async (c) =>
    toHttp(c, await service.metrics.compositesTrainingStrain(c.req.query())),
  );
  app.get("/composites/run-fatigue", async (c) =>
    toHttp(c, await service.metrics.compositesRunFatigue(c.req.query())),
  );
  app.get("/composites/fitness-trend", async (c) =>
    toHttp(c, await service.metrics.compositesFitnessTrend(c.req.query())),
  );
  app.get("/composites/load-quality", async (c) =>
    toHttp(c, await service.metrics.compositesLoadQuality(c.req.query())),
  );
  app.get("/composites/recovery-debt", async (c) =>
    toHttp(c, await service.metrics.compositesRecoveryDebt(c.req.query())),
  );
  app.get("/composites/consistency-index", async (c) =>
    toHttp(c, await service.metrics.compositesConsistencyIndex(c.req.query())),
  );
  app.get("/composites/run-economy", async (c) =>
    toHttp(c, await service.metrics.compositesRunEconomy(c.req.query())),
  );

  return app;
}
