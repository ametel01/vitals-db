import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDb } from "@vitals/db";
import { main } from "../cli";

function setEnv(overrides: NodeJS.ProcessEnv): () => void {
  const previous = { ...process.env };
  process.env = { ...process.env, ...overrides };
  return () => {
    process.env = previous;
  };
}

describe("health cli", () => {
  test.each(["help", "--help", "-h"])("health %s returns usage and status 0", async (helpArg) => {
    const code = await main([helpArg]);
    expect(code).toBe(0);
  });

  test("health with no arguments returns usage and status 1", async () => {
    const code = await main([]);
    expect(code).toBe(1);
  });

  test("rebuild preserves existing analytics if preflight import path is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vitals-cli-rebuild-"));
    const restore = setEnv({
      DB_PATH: join(dir, "vitals.duckdb"),
    });

    try {
      const db = await openDb(process.env.DB_PATH as string);
      await migrate(db);
      await db.run(
        "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
        ["wk-stable", "Running", "2024-06-01 08:00:00", "2024-06-01 09:00:00", 3600, "Apple Watch"],
      );
      await db.run("INSERT INTO _ingest_state (key, value) VALUES (?, ?), (?, ?)", [
        "last_import_ts",
        "0",
        "last_import_file",
        join(dir, "missing-export.xml"),
      ]);
      db.close();

      const code = await main(["rebuild"]);
      expect(code).toBe(1);

      const verificationDb = await openDb(process.env.DB_PATH as string);
      const preserved = await verificationDb.get<{ n: number }>(
        "SELECT COUNT(*)::INTEGER AS n FROM workouts",
      );
      verificationDb.close();
      expect(preserved?.n).toBe(1);
    } finally {
      restore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rebuild with invalid export XML uses temporary preflight DB and returns 1", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "vitals-cli-rebuild-"));
    const restore = setEnv({
      DB_PATH: join(tempDir, "vitals.duckdb"),
    });
    const badXmlPath = join(tempDir, "bad-export.xml");

    try {
      await writeFile(badXmlPath, "not-xml", "utf8");
      const db = await openDb(process.env.DB_PATH as string);
      await migrate(db);
      await db.run("INSERT INTO _ingest_state (key, value) VALUES (?, ?), (?, ?)", [
        "last_import_ts",
        "1234",
        "last_import_file",
        badXmlPath,
      ]);
      db.close();

      const code = await main(["rebuild"]);
      expect(code).toBe(1);
    } finally {
      restore();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
