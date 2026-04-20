import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./connect";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(
  db: Db,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMP
    )
  `);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

  const applied: string[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = await db.get<{ id: string }>("SELECT id FROM _migrations WHERE id = ?", [id]);
    if (existing) continue;

    const sql = await readFile(join(migrationsDir, file), "utf8");
    await db.exec("BEGIN TRANSACTION");
    try {
      await db.exec(sql);
      await db.run("INSERT INTO _migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)", [id]);
      await db.exec("COMMIT");
      applied.push(id);
    } catch (err) {
      await db.exec("ROLLBACK");
      throw err;
    }
  }
  return applied;
}
