import { describe, expect, test } from "bun:test";
import { loadEnv } from "../env";

describe("server env parsing", () => {
  test("loadEnv provides HOST and PORT defaults", () => {
    const env = loadEnv({});

    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe(8787);
    expect(env.DB_PATH).toBe("./vitals.duckdb");
    expect(env.NODE_ENV).toBe("development");
  });

  test("loadEnv accepts explicit HOST and PORT overrides", () => {
    const env = loadEnv({ HOST: "0.0.0.0", PORT: "9999" });

    expect(env.HOST).toBe("0.0.0.0");
    expect(env.PORT).toBe(9999);
  });

  test("loadEnv rejects empty HOST", () => {
    expect(() => loadEnv({ HOST: "" })).toThrow();
  });
});
