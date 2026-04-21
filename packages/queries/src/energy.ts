import { type EnergyPoint, EnergyPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.B. `energy` rows are sparse: a given row may carry active_kcal,
// basal_kcal, or both. COALESCE each column independently so a missing
// component does not null out the daily total.
export async function getEnergyDaily(db: Db, range: DateRange): Promise<EnergyPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 DATE(ts) AS day,
                 COALESCE(SUM(active_kcal), 0) AS active_kcal,
                 COALESCE(SUM(basal_kcal), 0) AS basal_kcal
               FROM energy
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; active_kcal: number; basal_kcal: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    EnergyPointSchema.parse({
      day: toIsoDate(row.day),
      active_kcal: row.active_kcal,
      basal_kcal: row.basal_kcal,
    }),
  );
}
