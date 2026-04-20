import { DuckDBInstance } from "@duckdb/node-api";

const instance = await DuckDBInstance.create(":memory:");
const connection = await instance.connect();
const reader = await connection.runAndReadAll("SELECT 42 AS answer");
const rows = reader.getRowObjectsJS();
const answer = rows[0]?.answer;
if (answer !== 42) {
  throw new Error(`Expected 42, got ${String(answer)}`);
}
connection.closeSync();
instance.closeSync();
process.stdout.write(`duckdb smoke ok (answer=${String(answer)})\n`);
