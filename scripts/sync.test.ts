import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

describe("sync.sh", () => {
  test("statusline.mjs と limits-fetch.mjs を同じ dest に deploy する", async () => {
    const dir = join(tmpdir(), `statusline-sync-${process.pid}-${Date.now()}`);
    const pluginRoot = join(dir, "plugin");
    const home = join(dir, "home");
    await mkdir(join(pluginRoot, "scripts"), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(pluginRoot, "scripts", "statusline.mjs"), "statusline\n");
    await writeFile(join(pluginRoot, "scripts", "limits-fetch.mjs"), "fetcher\n");

    try {
      const proc = Bun.spawn({
        cmd: ["sh", "scripts/sync.sh"],
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: pluginRoot,
          HOME: home,
        },
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" });
      await expect(readFile(join(home, ".claude", "statusline-limits", "statusline.mjs"), "utf8"))
        .resolves.toBe("statusline\n");
      await expect(
        readFile(join(home, ".claude", "statusline-limits", "limits-fetch.mjs"), "utf8"),
      ).resolves.toBe("fetcher\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
