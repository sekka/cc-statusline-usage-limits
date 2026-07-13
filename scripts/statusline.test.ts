import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { maybeSpawnLimitsFetch, parseInput, renderStatusline } from "./statusline.mjs";

const fixture = {
  model: { display_name: "Sonnet 4.5" },
  context_window: {
    used_percentage: 54,
    used_tokens: 108000,
    context_window_size: 200000,
  },
  rate_limits: {
    five_hour: { used_percentage: 61, resets_at: 2000003600 },
    seven_day: { used_percentage: 22, resets_at: 2000067200 },
  },
};

const extendedCache = {
  data: {
    five_hour: { percent: 61, resets_at: "2033-05-18T04:33:20.000Z" },
    seven_day: { percent: 22, resets_at: "2033-05-18T22:13:20.000Z" },
    limits: [
      {
        kind: "weekly_scoped",
        percent: 71,
        resets_at: "2033-05-18T22:13:20.000Z",
        scope: { model: { display_name: "Fable" } },
      },
      {
        kind: "weekly_scoped",
        percent: 43,
        resets_at: "2033-05-18T22:13:20.000Z",
        scope: { model: { display_name: "Opus" } },
      },
    ],
  },
  stale: false,
};

describe("statusline.mjs", () => {
  test("Core stdin と Extended cache から非 Fable weekly_scoped を含むゴールデンを描画する", () => {
    expect(
      renderStatusline(fixture, { cache: extendedCache, color: false, now: 2000000000000 }),
    ).toBe(
      "Sonnet 4.5 TK:⣿⣿⣤⣀⣀ 54% 108.0K/200.0K CC5:⣿⣿⣿⣀⣀ 61% 1h CCW:⣿⣀⣀⣀⣀ 22% 18h40m Fable:⣿⣿⣿⣤⣀ 71% 18h40m Opus:⣿⣿⣀⣀⣀ 43% 18h40m",
    );
  });

  test("malformed stdin は空オブジェクトとして扱う", () => {
    expect(parseInput("{not json")).toEqual({});
  });

  test("fetcher が無ければ spawn しない", () => {
    let spawned = 0;
    const didSpawn = maybeSpawnLimitsFetch({
      scriptDir: "/tmp/statusline-limits-no-fetcher",
      cacheFile: "/tmp/statusline-limits-no-fetcher/cache.json",
      spawnImpl: () => {
        spawned += 1;
        return { unref() {} };
      },
    });
    expect(didSpawn).toBe(false);
    expect(spawned).toBe(0);
  });

  test("fetcher が存在し取得間隔を過ぎていれば spawn する", async () => {
    const dir = join(tmpdir(), `statusline-limits-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "limits-fetch.mjs"), "");
    let spawned = 0;
    try {
      const didSpawn = maybeSpawnLimitsFetch({
        scriptDir: dir,
        cacheFile: join(dir, "missing-cache.json"),
        spawnImpl: () => {
          spawned += 1;
          return { unref() {} };
        },
      });
      expect(didSpawn).toBe(true);
      expect(spawned).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
