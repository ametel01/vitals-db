import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

function createScript(body: string): string {
  return `#!/usr/bin/env node\n${body}\n`;
}

async function runHookWithFakeDoctor(
  fakeDoctorDir: string,
  fakeDoctorCode: 0 | 1,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const fakeDoctorPath = join(fakeDoctorDir, "react-doctor");
  await writeFile(fakeDoctorPath, createScript(`process.exit(${fakeDoctorCode});`), {
    mode: 0o755,
  });

  const result = spawnSync("bun", ["scripts/react-doctor-precommit.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${fakeDoctorDir}${delimiter}${process.env.PATH ?? ""}`,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("react-doctor pre-commit wrapper", () => {
  test("returns 0 when react-doctor passes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vitals-react-doctor-"));
    try {
      const result = await runHookWithFakeDoctor(dir, 0);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns 1 and prints guidance when react-doctor fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vitals-react-doctor-"));
    try {
      const result = await runHookWithFakeDoctor(dir, 1);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("React Doctor found staged regressions.");
      expect(result.stderr).toContain("Run react-doctor --staged --blocking warning to inspect.");
      expect(result.stderr).toContain(
        "Want them fixed? Ask your agent to run that command and resolve the findings.",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
