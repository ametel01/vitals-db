import type { Db } from "@vitals/db";
import { Hono } from "hono";
import { metricsRouter } from "./routes/metrics";
import { workoutsRouter } from "./routes/workouts";
import { createVitalsReadService } from "./services/read-service";

export interface AppDeps {
  db: Db;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const readService = createVitalsReadService(deps.db);

  app.onError((err, c) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`internal_error: ${message}\n`);
    return c.json({ error: "internal_error" }, 500);
  });

  app.route("/workouts", workoutsRouter(readService));
  app.route("/metrics", metricsRouter(readService));

  return app;
}
