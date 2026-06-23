import { describe, expect, test } from "bun:test";
import { zone2Status } from "../performance-zones";

describe("zone 2 status helper", () => {
  test("classifies missing ratios as no-data", () => {
    expect(zone2Status(null)).toEqual({ label: "No data", tone: "neutral" });
  });

  test("classifies high zone 2 ratios", () => {
    expect(zone2Status(0.55)).toEqual({ label: "High Z2", tone: "success" });
  });

  test("classifies mixed zone 2 ratios", () => {
    expect(zone2Status(0.3)).toEqual({ label: "Mixed Z2", tone: "warning" });
  });

  test("classifies low zone 2 ratios", () => {
    expect(zone2Status(0.1)).toEqual({ label: "Low Z2", tone: "danger" });
  });
});
