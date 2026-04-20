import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Db, openDb } from "../connect";

describe("openDb (in-memory)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await openDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("run + all round-trip a literal value", async () => {
    const rows = await db.all<{ answer: number }>("SELECT 42 AS answer");
    expect(rows).toEqual([{ answer: 42 }]);
  });

  test("binds parameters via ?", async () => {
    const row = await db.get<{ doubled: number }>("SELECT ? * 2 AS doubled", [21]);
    expect(row).toEqual({ doubled: 42 });
  });

  test("prepare returns reusable parameterized statements", async () => {
    const stmt = await db.prepare("SELECT ? * 2 AS doubled");
    try {
      expect(await stmt.get<{ doubled: number }>([21])).toEqual({ doubled: 42 });
      expect(await stmt.all<{ doubled: number }>([7])).toEqual([{ doubled: 14 }]);
    } finally {
      stmt.close();
    }
  });

  test("prepared run executes statements", async () => {
    await db.exec("CREATE TABLE prepared_insert (v INTEGER)");
    const stmt = await db.prepare("INSERT INTO prepared_insert VALUES (?)");
    try {
      await stmt.run([11]);
      await stmt.run([31]);
    } finally {
      stmt.close();
    }

    const row = await db.get<{ total: number }>(
      "SELECT SUM(v)::INTEGER AS total FROM prepared_insert",
    );
    expect(row).toEqual({ total: 42 });
  });

  test("get returns null when no rows", async () => {
    await db.exec("CREATE TABLE t (v INTEGER)");
    const row = await db.get<{ v: number }>("SELECT v FROM t");
    expect(row).toBeNull();
  });
});
