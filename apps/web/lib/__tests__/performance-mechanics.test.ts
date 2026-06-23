import { describe, expect, test } from "bun:test";
import type { RunningDynamicsPoint } from "@vitals/core";
import { buildPerformanceMechanicsRows } from "../performance-mechanics";

function dynamics(overrides: Partial<RunningDynamicsPoint>): RunningDynamicsPoint {
  return {
    day: "2024-06-01",
    avg_ground_contact_time_ms: 0,
    avg_stride_length_m: 0,
    avg_vertical_oscillation_cm: 0,
    ...overrides,
  };
}

describe("performance mechanics helpers", () => {
  test("maps ground-contact, stride length, and oscillation into rows", () => {
    const rows = buildPerformanceMechanicsRows([
      dynamics({
        avg_ground_contact_time_ms: 305,
        avg_stride_length_m: 0.95,
        avg_vertical_oscillation_cm: 10.5,
      }),
    ]);

    expect(rows.map((row) => row.label)).toEqual([
      "Ground contact time",
      "Stride length",
      "Vert. oscillation",
    ]);
    expect(rows[0]?.value).toBe("305 ms");
    expect(rows[1]?.value).toBe("0.95 m");
    expect(rows[2]?.value).toBe("10.5 cm");
  });

  test("omits metrics when all values are null", () => {
    const rows = buildPerformanceMechanicsRows([
      dynamics({
        avg_ground_contact_time_ms: null,
        avg_stride_length_m: null,
        avg_vertical_oscillation_cm: null,
      }),
    ]);

    expect(rows).toHaveLength(0);
  });
});
