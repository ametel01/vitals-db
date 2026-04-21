import { z } from "zod";

const EnvSchema = z.object({
  DB_PATH: z.string().min(1).default("./vitals.duckdb"),
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse({
    DB_PATH: source.DB_PATH,
    PORT: source.PORT,
    NODE_ENV: source.NODE_ENV,
  });
}
