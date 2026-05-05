import { describe, expect, test } from "bun:test";
import { type ParsedNode, parseHealthExportString } from "../parser";

async function collect(xml: string): Promise<ParsedNode[]> {
  const out: ParsedNode[] = [];
  for await (const n of parseHealthExportString(xml)) out.push(n);
  return out;
}

const WRAPPER = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_GB">\n${inner}\n</HealthData>`;

describe("parser edge cases", () => {
  test("drops user-entered samples", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 08:00:00 +0000" ` +
        `endDate="2024-06-01 08:00:00 +0000" value="72">` +
        `<MetadataEntry key="HKWasUserEntered" value="1"/>` +
        "</Record>",
    );
    expect(await collect(xml)).toEqual([]);
  });

  test("captures workout children (events/stats/metadata/routes)", async () => {
    const xml = WRAPPER(
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" ` +
        `sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000">` +
        `<MetadataEntry key="HKIndoorWorkout" value="0"/>` +
        `<WorkoutEvent type="HKWorkoutEventTypeSegment" date="2024-06-01 08:00:00 +0000" duration="5" durationUnit="min"/>` +
        `<WorkoutStatistics type="HKQuantityTypeIdentifierRunningPower" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000" average="210" minimum="180" maximum="240" unit="W"/>` +
        `<WorkoutRoute sourceName="Apple Watch" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"><FileReference path="/workout-routes/route.gpx"/></WorkoutRoute>` +
        "</Workout>",
    );
    const out = await collect(xml);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("workout");
    if (out[0]?.kind !== "workout") return;
    expect(out[0].metadata).toHaveLength(1);
    expect(out[0].events).toHaveLength(1);
    expect(out[0].statistics).toHaveLength(1);
    expect(out[0].routes).toHaveLength(1);
  });

  test("preserves node order in mixed streams", async () => {
    const xml = WRAPPER(
      `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>` +
        `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:30:00 +0000"/>` +
        `<Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:15 +0000" value="120"/>`,
    );
    const out = await collect(xml);
    expect(out.map((n) => n.kind)).toEqual(["record", "workout", "record"]);
  });
});
