import type { Db } from "@vitals/db";
import { Hono } from "hono";
import { metricsRouter } from "./routes/metrics";
import { workoutsRouter } from "./routes/workouts";

export interface AppDeps {
  db: Db;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "internal_error";
    return c.json({ error: "internal_error", message }, 500);
  });

  app.route("/workouts", workoutsRouter(deps.db));
  app.route("/metrics", metricsRouter(deps.db));

  return app;
}
