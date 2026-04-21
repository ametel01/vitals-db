import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, migrate, openDb } from "@vitals/db";
import { getLastImportFile, getLastImportTs, ingestFile } from "../incremental";

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 08:00:05 +0000" endDate="2024-06-01 08:00:05 +0000" value="75"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 05:00:00 +0000" endDate="2024-06-01 05:00:00 +0000" value="55"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="2024-06-01 06:00:00 +0000" endDate="2024-06-01 06:00:00 +0000" value="42"/>
  <Record type="HKQuantityTypeIdentifierWalkingHeartRateAverage" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 09:00:00 +0000" endDate="2024-06-01 09:00:00 +0000" value="88"/>
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="120"/>
  <Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="iPhone" unit="m" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="102.3"/>
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kcal" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="3.5"/>
  <Record type="HKQuantityTypeIdentifierBasalEnergyBurned" sourceName="Apple Watch" unit="kcal" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="1.1"/>
  <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Apple Watch" unit="ml/kg·min" startDate="2024-06-01 07:00:00 +0000" endDate="2024-06-01 07:00:00 +0000" value="48.2"/>
  <Record type="HKQuantityTypeIdentifierRunningSpeed" sourceName="Apple Watch" unit="m/s" startDate="2024-06-01 08:05:00 +0000" endDate="2024-06-01 08:05:00 +0000" value="3.2"/>
  <Record type="HKQuantityTypeIdentifierRunningPower" sourceName="Apple Watch" unit="W" startDate="2024-06-01 08:05:00 +0000" endDate="2024-06-01 08:05:00 +0000" value="210"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2024-05-31 23:00:00 +0000" endDate="2024-06-01 06:30:00 +0000" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2024-05-31 22:45:00 +0000" endDate="2024-05-31 23:00:00 +0000" value="HKCategoryValueSleepAnalysisInBed"/>
  <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="MyFitnessPal" unit="g" startDate="2024-06-01 12:00:00 +0000" endDate="2024-06-01 12:00:00 +0000" value="20"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 08:00:10 +0000" endDate="2024-06-01 08:00:10 +0000" value="78">
    <MetadataEntry key="HKWasUserEntered" value="1"/>
  </Record>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000">
    <WorkoutEvent type="HKWorkoutEventTypePause" date="2024-06-01 08:10:00 +0000"/>
  </Workout>
</HealthData>
`;

const FUTURE_DUPLICATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-04 08:00:00 +0000" endDate="2024-06-04 08:00:00 +0000" value="72"/>
</HealthData>
`;

const DUPLICATE_WORKOUT_WINDOW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="31" durationUnit="min" sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"/>
</HealthData>
`;

describe("ingestFile integration", () => {
  let dir: string;
  let dbPath: string;
  let xmlPath: string;
  let db: Db;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vitals-ingest-test-"));
    dbPath = join(dir, "test.duckdb");
    xmlPath = join(dir, "export.xml");
    await writeFile(xmlPath, FIXTURE_XML, "utf8");
    db = await openDb(dbPath);
    await migrate(db);
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("inserts expected rows per table and skips out-of-scope/manual samples", async () => {
    const stats = await ingestFile(db, xmlPath);

    // Three HR Records in XML: one duplicate (same ts/value/source) and one
    // manual-entry. The manual-entry never reaches the writer; the duplicate
    // reaches dedup and is skipped — so only 2 fresh HR rows land.
    expect(stats.inserted.heart_rate).toBe(2);
    expect(stats.inserted.resting_hr).toBe(1);
    expect(stats.inserted.hrv).toBe(1);
    expect(stats.inserted.walking_hr).toBe(1);
    expect(stats.inserted.steps).toBe(1);
    expect(stats.inserted.distance).toBe(1);
    expect(stats.inserted.energy).toBe(2);
    expect(stats.inserted.performance).toBe(3);
    expect(stats.inserted.sleep).toBe(2);
    expect(stats.inserted.workouts).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  test("row counts via SELECT match stats", async () => {
    await ingestFile(db, xmlPath);

    const tables = [
      ["heart_rate", 2],
      ["resting_hr", 1],
      ["hrv", 1],
      ["walking_hr", 1],
      ["steps", 1],
      ["distance", 1],
      ["energy", 2],
      ["performance", 3],
      ["sleep", 2],
      ["workouts", 1],
    ] as const;
    for (const [table, expected] of tables) {
      const row = await db.get<{ n: number }>(`SELECT COUNT(*)::INTEGER AS n FROM ${table}`);
      expect(row?.n).toBe(expected);
    }
  });

  test("re-ingesting the same file adds zero new rows (dedup)", async () => {
    await ingestFile(db, xmlPath);
    const before = await db.get<{ n: number }>("SELECT COUNT(*)::INTEGER AS n FROM heart_rate");

    // Bypass the incremental filter so dedup is actually exercised across the full file.
    const stats = await ingestFile(db, xmlPath, { full: true });

    const after = await db.get<{ n: number }>("SELECT COUNT(*)::INTEGER AS n FROM heart_rate");
    expect(after?.n).toBe(before?.n ?? -1);
    expect(Object.values(stats.inserted).reduce((a, b) => a + b, 0)).toBe(0);
    expect(stats.skipped).toBeGreaterThan(0);
  });

  test("records last_import_ts and last_import_file", async () => {
    await ingestFile(db, xmlPath);

    const ts = await getLastImportTs(db);
    expect(ts).not.toBeNull();

    const file = await getLastImportFile(db);
    expect(file).toBe(xmlPath);
  });

  test("advances last_import_ts for processed duplicate rows", async () => {
    const futurePath = join(dir, "future-duplicate.xml");
    await writeFile(futurePath, FUTURE_DUPLICATE_XML, "utf8");

    await ingestFile(db, futurePath);
    const firstTs = await getLastImportTs(db);
    expect(firstTs).not.toBeNull();

    await setLastImportTsMsForTest(db, Date.parse("2024-06-02T00:00:00.000Z"));
    const stats = await ingestFile(db, futurePath);
    const secondTs = await getLastImportTs(db);

    expect(stats.inserted.heart_rate).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(secondTs).toBe(firstTs);
  });

  test("duplicate workout window with changed duration does not abort ingestion", async () => {
    const workoutPath = join(dir, "duplicate-workout.xml");
    await writeFile(workoutPath, DUPLICATE_WORKOUT_WINDOW_XML, "utf8");

    const stats = await ingestFile(db, workoutPath);
    const count = await db.get<{ n: number }>("SELECT COUNT(*)::INTEGER AS n FROM workouts");

    expect(stats.inserted.workouts).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(count?.n).toBe(1);
  });

  test("honours custom batchSize (forces multiple transactions)", async () => {
    const stats = await ingestFile(db, xmlPath, { batchSize: 2 });
    expect(stats.inserted.heart_rate).toBe(2);
    expect(stats.skipped).toBe(1);
  });

  test("energy sparse columns round-trip through DuckDB", async () => {
    await ingestFile(db, xmlPath);
    const rows = await db.all<{ active_kcal: number | null; basal_kcal: number | null }>(
      "SELECT active_kcal, basal_kcal FROM energy ORDER BY active_kcal NULLS LAST",
    );
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.active_kcal === 3.5 && r.basal_kcal === null)).toBe(true);
    expect(rows.some((r) => r.active_kcal === null && r.basal_kcal === 1.1)).toBe(true);
  });

  test("sleep state is normalized while raw stages are preserved", async () => {
    await ingestFile(db, xmlPath);
    const rows = await db.all<{ state: string; raw_state: string | null }>(
      "SELECT state, raw_state FROM sleep ORDER BY start_ts",
    );
    expect(rows).toEqual([
      { state: "in_bed", raw_state: "HKCategoryValueSleepAnalysisInBed" },
      { state: "asleep", raw_state: "HKCategoryValueSleepAnalysisAsleepCore" },
    ]);
  });
});

async function setLastImportTsMsForTest(db: Db, ms: number): Promise<void> {
  await db.run(
    "INSERT INTO _ingest_state (key, value) VALUES ('last_import_ts', ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [new Date(ms).toISOString()],
  );
}
