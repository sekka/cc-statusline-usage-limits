import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

describe("generate-limits-fetch", () => {
  test("committed limits-fetch.mjs matches deterministic generation", async () => {
    const out = join(tmpdir(), `limits-fetch-generated-${process.pid}-${Date.now()}.mjs`);
    try {
      const proc = Bun.spawn({
        cmd: ["bun", "scripts/generate-limits-fetch.ts", "--out", out],
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exitCode, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stderr).text(),
      ]);
      expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });

      const [generated, committed] = await Promise.all([
        readFile(out, "utf8"),
        readFile("scripts/limits-fetch.mjs", "utf8"),
      ]);
      expect(generated).toBe(committed);
    } finally {
      await rm(out, { force: true });
    }
  });
});
