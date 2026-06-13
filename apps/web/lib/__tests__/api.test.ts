import { afterEach, describe, expect, test } from "bun:test";
import { getLoad } from "../api";

const originalFetch = globalThis.fetch;

describe("web API client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("getLoad accepts legacy load rows without start_ts", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            workout_id: "legacy-load",
            duration_sec: 3600,
            avg_hr: 120,
            load: 432_000,
          },
        ]),
        { status: 200 },
      );

    const result = await getLoad({ from: "2024-06-01", to: "2024-06-02" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({
        workout_id: "legacy-load",
        start_ts: "",
        duration_sec: 3600,
        avg_hr: 120,
        load: 432_000,
      });
    }
  });

  test("getLoad preserves dated load rows from the current API", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            workout_id: "dated-load",
            start_ts: "2024-06-01T08:00:00.000Z",
            duration_sec: 3600,
            avg_hr: 120,
            load: 432_000,
          },
        ]),
        { status: 200 },
      );

    const result = await getLoad({ from: "2024-06-01", to: "2024-06-02" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.start_ts).toBe("2024-06-01T08:00:00.000Z");
    }
  });
});
