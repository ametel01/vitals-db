import type { Db } from "@vitals/db";
import {
  type DateRange,
  getLoadForRange,
  getRestingHRDaily,
  getSleepSummary,
  getVO2MaxDaily,
  getZones,
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

  app.get("/resting-hr", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getRestingHRDaily(db, parsed));
  });

  app.get("/sleep", async (c) => {
    const parsed = parseRange(c.req.query());
    if ("error" in parsed) return c.json({ error: "invalid_query", issues: parsed.error }, 400);
    return c.json(await getSleepSummary(db, parsed));
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

  return app;
}
