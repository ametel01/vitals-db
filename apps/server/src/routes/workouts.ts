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

export function workoutsRouter(service: VitalsReadService): Hono {
  const app = new Hono();

  app.get("/", async (c) => toHttp(c, await service.workouts.list(c.req.query())));
  app.get("/:id", async (c) => toHttp(c, await service.workouts.detail(c.req.param("id"))));
  app.get("/:id/hr", async (c) => toHttp(c, await service.workouts.hr(c.req.param("id"))));
  app.get("/:id/zones", async (c) => toHttp(c, await service.workouts.zones(c.req.param("id"))));
  app.get("/:id/efficiency", async (c) =>
    toHttp(c, await service.workouts.efficiency(c.req.param("id"), c.req.query())),
  );
  app.get("/:id/stats", async (c) => toHttp(c, await service.workouts.stats(c.req.param("id"))));
  app.get("/:id/events", async (c) => toHttp(c, await service.workouts.events(c.req.param("id"))));
  app.get("/:id/metadata", async (c) =>
    toHttp(c, await service.workouts.metadata(c.req.param("id"))),
  );
  app.get("/:id/routes", async (c) => toHttp(c, await service.workouts.routes(c.req.param("id"))));

  return app;
}
