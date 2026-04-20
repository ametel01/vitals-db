import { describe, expect, test } from "bun:test";
import { HR_ZONES } from "../zones";

describe("HR_ZONES", () => {
  test("Z2 matches spec §4.1 (115-125 bpm)", () => {
    expect(HR_ZONES.Z2).toEqual({ min: 115, max: 125 });
  });
});
