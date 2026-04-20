import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBPreparedStatement,
  type DuckDBValue,
} from "@duckdb/node-api";

export type SqlValue = DuckDBValue;

export interface PreparedStatement {
  run(values?: SqlValue[]): Promise<void>;
  all<T = Record<string, unknown>>(values?: SqlValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(values?: SqlValue[]): Promise<T | null>;
  close(): void;
}

export interface Db {
  run(sql: string, values?: SqlValue[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, values?: SqlValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, values?: SqlValue[]): Promise<T | null>;
  prepare(sql: string): Promise<PreparedStatement>;
  exec(sql: string): Promise<void>;
  connection(): DuckDBConnection;
  close(): void;
}

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? "./vitals.duckdb";
}

export async function openDb(path: string = defaultDbPath()): Promise<Db> {
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();

  const run: Db["run"] = async (sql, values) => {
    await connection.run(sql, values);
  };

  const all: Db["all"] = async <T>(sql: string, values?: SqlValue[]) => {
    const reader = await connection.runAndReadAll(sql, values);
    return reader.getRowObjectsJS() as T[];
  };

  const get: Db["get"] = async <T>(sql: string, values?: SqlValue[]) => {
    const rows = await all<T>(sql, values);
    return rows[0] ?? null;
  };

  const prepare: Db["prepare"] = async (sql) => {
    const prepared = await connection.prepare(sql);
    return wrapPreparedStatement(prepared);
  };

  const exec: Db["exec"] = async (sql) => {
    await connection.run(sql);
  };

  return {
    run,
    all,
    get,
    prepare,
    exec,
    connection: () => connection,
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

function wrapPreparedStatement(prepared: DuckDBPreparedStatement): PreparedStatement {
  const bind = (values?: SqlValue[]) => {
    prepared.clearBindings();
    if (values) prepared.bind(values);
  };

  const all: PreparedStatement["all"] = async <T>(values?: SqlValue[]) => {
    bind(values);
    const reader = await prepared.runAndReadAll();
    return reader.getRowObjectsJS() as T[];
  };

  return {
    run: async (values) => {
      bind(values);
      await prepared.run();
    },
    all,
    get: async <T>(values?: SqlValue[]) => {
      const rows = await all<T>(values);
      return rows[0] ?? null;
    },
    close: () => {
      prepared.destroySync();
    },
  };
}
