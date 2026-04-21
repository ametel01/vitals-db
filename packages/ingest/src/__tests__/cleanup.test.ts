import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cropHealthExport } from "../cleanup";
import { parseHealthExportString } from "../parser";

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
  <ExportDate value="2026-04-21 12:00:00 +0000"/>
  <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeNotSet" HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeNotSet" HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse="0"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-01 08:00:00 +0000" endDate="2024-06-01 08:00:00 +0000" value="72"/>
  <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="MyFitnessPal" unit="g" startDate="2024-06-03 08:00:00 +0000" endDate="2024-06-03 08:00:00 +0000" value="20"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2024-06-03 08:05:00 +0000" endDate="2024-06-03 08:05:00 +0000" value="75">
    <MetadataEntry key="HKWasUserEntered" value="1"/>
  </Record>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Apple Watch" startDate="2024-06-01 09:00:00 +0000" endDate="2024-06-01 09:30:00 +0000"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="35" durationUnit="min" sourceName="Apple Watch" startDate="2024-06-03 09:00:00 +0000" endDate="2024-06-03 09:35:00 +0000"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2024-06-03 22:00:00 +0000" endDate="2024-06-04 06:00:00 +0000" value="HKCategoryValueSleepAnalysisAsleepCore"/>
</HealthData>
`;

const OUTPUT_DIRS: string[] = [];

async function collectKindsAndEnds(xml: string): Promise<Array<{ kind: string; endDate: string }>> {
  const out: Array<{ kind: string; endDate: string }> = [];
  for await (const node of parseHealthExportString(xml)) {
    out.push({ kind: node.kind, endDate: node.endDate });
  }
  return out;
}

describe("cropHealthExport", () => {
  afterEach(async () => {
    await Promise.all(
      OUTPUT_DIRS.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  test("keeps only supported nodes inside the cutoff window", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vitals-crop-test-"));
    OUTPUT_DIRS.push(dir);

    const inputPath = join(dir, "source.xml");
    const outputPath = join(dir, "cropped.xml");
    await writeFile(inputPath, SOURCE_XML, "utf8");

    const result = await cropHealthExport(inputPath, {
      cutoffMs: Date.parse("2024-06-03T00:00:00.000Z"),
      outputPath,
    });

    expect(result.outputPath).toBe(outputPath);
    expect(result.stats).toEqual({
      nodesSeen: 6,
      nodesKept: 2,
      droppedBeforeCutoff: 2,
      droppedUnsupported: 1,
      droppedUserEntered: 1,
    });

    const croppedXml = await readFile(outputPath, "utf8");
    expect(croppedXml).toContain('<HealthData locale="en_GB">');
    expect(croppedXml).toContain("<ExportDate ");
    expect(croppedXml).toContain("<Me ");
    expect(croppedXml).not.toContain("DietaryProtein");
    expect(croppedXml).not.toContain('key="HKWasUserEntered" value="1"');

    const kept = await collectKindsAndEnds(croppedXml);
    expect(kept).toEqual([
      { kind: "workout", endDate: "2024-06-03 09:35:00 +0000" },
      { kind: "record", endDate: "2024-06-04 06:00:00 +0000" },
    ]);
  });
});
