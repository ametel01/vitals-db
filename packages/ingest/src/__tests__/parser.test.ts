import { describe, expect, test } from "bun:test";
import { type ParsedNode, parseHealthExportString } from "../parser";

async function collect(xml: string): Promise<ParsedNode[]> {
  const out: ParsedNode[] = [];
  for await (const n of parseHealthExportString(xml)) out.push(n);
  return out;
}

const WRAPPER = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_GB">\n${inner}\n</HealthData>`;

describe("parser", () => {
  test("emits in-scope Record nodes with attributes", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" ` +
        `startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>`,
    );
    const out = await collect(xml);
    expect(out).toEqual([
      {
        kind: "record",
        type: "HKQuantityTypeIdentifierHeartRate",
        startDate: "2024-06-01 08:00:00 +0000",
        endDate: "2024-06-01 08:00:00 +0000",
        value: "72",
        sourceName: "Apple Watch",
        unit: "count/min",
      },
    ]);
  });

  test("drops Record types outside the HK filter list", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierDietaryProtein" startDate="2024-06-01 08:00:00 +0000" ` +
        `endDate="2024-06-01 08:00:00 +0000" value="20"/>`,
    );
    expect(await collect(xml)).toEqual([]);
  });

  test("drops samples flagged HKWasUserEntered=1", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 08:00:00 +0000" ` +
        `endDate="2024-06-01 08:00:00 +0000" value="72">` +
        `<MetadataEntry key="HKWasUserEntered" value="1"/>` +
        "</Record>",
    );
    expect(await collect(xml)).toEqual([]);
  });

  test("keeps samples with MetadataEntry that isn't HKWasUserEntered=1", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 08:00:00 +0000" ` +
        `endDate="2024-06-01 08:00:00 +0000" value="72">` +
        `<MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="0"/>` +
        `<MetadataEntry key="HKWasUserEntered" value="0"/>` +
        "</Record>",
    );
    const out = await collect(xml);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("record");
  });

  test("emits Workout nodes independent of Record filtering", async () => {
    const xml = WRAPPER(
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" ` +
        `sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000">` +
        `<WorkoutEvent type="HKWorkoutEventTypePause" date="2024-06-01 08:10:00 +0000"/>` +
        "</Workout>",
    );
    const out = await collect(xml);
    expect(out).toEqual([
      {
        kind: "workout",
        workoutActivityType: "HKWorkoutActivityTypeRunning",
        startDate: "2024-06-01 08:00:00 +0000",
        endDate: "2024-06-01 08:30:00 +0000",
        duration: "30",
        durationUnit: "min",
        sourceName: "Apple Watch",
      },
    ]);
  });

  test("drops malformed Workout activity types", async () => {
    const xml = WRAPPER(
      `<Workout workoutActivityType="Running" duration="30" durationUnit="min" ` +
        `startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"/>` +
        `<Workout duration="30" durationUnit="min" ` +
        `startDate="2024-06-01 09:00:00 +0000" endDate="2024-06-01 09:30:00 +0000"/>`,
    );
    expect(await collect(xml)).toEqual([]);
  });

  test("emits Sleep Category records", async () => {
    const xml = WRAPPER(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" ` +
        `startDate="2024-06-01 23:00:00 +0000" endDate="2024-06-02 06:30:00 +0000" ` +
        `value="HKCategoryValueSleepAnalysisAsleepCore"/>`,
    );
    const out = await collect(xml);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("record");
    if (out[0]?.kind === "record") {
      expect(out[0].type).toBe("HKCategoryTypeIdentifierSleepAnalysis");
      expect(out[0].value).toBe("HKCategoryValueSleepAnalysisAsleepCore");
    }
  });

  test("handles a mixed document and preserves order", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>` +
        `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"/>` +
        `<Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="120"/>`,
    );
    const out = await collect(xml);
    expect(out.map((n) => n.kind)).toEqual(["record", "workout", "record"]);
  });
});
