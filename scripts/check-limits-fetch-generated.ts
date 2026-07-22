import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = join(tmpdir(), `limits-fetch-check-${process.pid}-${Date.now()}.mjs`);

try {
  const proc = Bun.spawn({
    cmd: ["bun", "scripts/generate-limits-fetch.ts", "--out", out],
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);

  const [generated, committed] = await Promise.all([
    readFile(out, "utf8"),
    readFile("scripts/limits-fetch.mjs", "utf8"),
  ]);

  if (generated !== committed) {
    console.error("scripts/limits-fetch.mjs is not in sync with usage-limits-core pin");
    console.error("Run: bun run generate:limits-fetch");
    process.exit(1);
  }
} finally {
  await rm(out, { force: true });
}
