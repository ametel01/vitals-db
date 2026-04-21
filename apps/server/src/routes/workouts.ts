import type { Db } from "@vitals/db";
import {
  type ListWorkoutsParams,
  getWorkoutDetail,
  getWorkoutEfficiency,
  getWorkoutHR,
  getWorkoutSummary,
  getWorkoutZoneBreakdown,
  listWorkouts,
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

export function workoutsRouter(db: Db): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const parsed = ListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid_query", issues: parsed.error.issues }, 400);
    }
    const params: ListWorkoutsParams = {};
    if (parsed.data.type !== undefined) params.type = parsed.data.type;
    if (parsed.data.from !== undefined) params.from = parsed.data.from;
    if (parsed.data.to !== undefined) params.to = parsed.data.to;
    if (parsed.data.limit !== undefined) params.limit = parsed.data.limit;
    if (parsed.data.offset !== undefined) params.offset = parsed.data.offset;
    const rows = await listWorkouts(db, params);
    return c.json(rows);
  });

  app.get("/:id", async (c) => {
    const parsed = WorkoutIdParamsSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) {
      return c.json({ error: "invalid_params", issues: parsed.error.issues }, 400);
    }

    const detail = await getWorkoutDetail(db, parsed.data.id);
    if (detail === null) return c.json({ error: "not_found" }, 404);
    return c.json(detail);
  });

  app.get("/:id/hr", async (c) => {
    const parsed = WorkoutIdParamsSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) {
      return c.json({ error: "invalid_params", issues: parsed.error.issues }, 400);
    }

    const workout = await getWorkoutSummary(db, parsed.data.id);
    if (workout === null) {
      return c.json({ error: "not_found" }, 404);
    }

    const points = await getWorkoutHR(db, parsed.data.id);
    return c.json(points);
  });

  app.get("/:id/zones", async (c) => {
    const parsed = WorkoutIdParamsSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) {
      return c.json({ error: "invalid_params", issues: parsed.error.issues }, 400);
    }

    const workout = await getWorkoutSummary(db, parsed.data.id);
    if (workout === null) {
      return c.json({ error: "not_found" }, 404);
    }

    const rows = await getWorkoutZoneBreakdown(db, parsed.data.id);
    return c.json(rows);
  });

  app.get("/:id/efficiency", async (c) => {
    const parsedParams = WorkoutIdParamsSchema.safeParse({ id: c.req.param("id") });
    if (!parsedParams.success) {
      return c.json({ error: "invalid_params", issues: parsedParams.error.issues }, 400);
    }

    const parsedQuery = EfficiencyQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: "invalid_query", issues: parsedQuery.error.issues }, 400);
    }

    const workout = await getWorkoutSummary(db, parsedParams.data.id);
    if (workout === null) {
      return c.json({ error: "not_found" }, 404);
    }

    const efficiencyParams: { hrMin?: number; hrMax?: number } = {};
    if (parsedQuery.data.hr_min !== undefined) efficiencyParams.hrMin = parsedQuery.data.hr_min;
    if (parsedQuery.data.hr_max !== undefined) efficiencyParams.hrMax = parsedQuery.data.hr_max;
    const efficiency = await getWorkoutEfficiency(db, parsedParams.data.id, {
      ...efficiencyParams,
    });
    return c.json(efficiency);
  });

  return app;
}
