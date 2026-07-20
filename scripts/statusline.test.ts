import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { maybeSpawnLimitsFetch, parseInput, readCache, renderStatusline } from "./statusline.mjs";

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
      "Sonnet 4.5 TK:⣿⣿⣶⣀⣀ 54% 108.0K/200.0K CC5:⣿⣿⣿⣀⣀ 61% (13:33|1h0m) CCW:⣿⣄⣀⣀⣀ 22% (5/19 07:13|18h40m) CCF:⣿⣿⣿⣦⣀ 71% (5/19 07:13|18h40m)",
    );
  });

  test("color=true では旧 statusline と同じ limits 装飾を描画する", () => {
    const staleCache = { ...extendedCache, stale: true, timestamp: 2000000000000 - 6 * 60 * 1000 };
    expect(renderStatusline(fixture, { cache: staleCache, color: true, now: 2000000000000 })).toBe(
      "\x1b[97mSonnet 4.5\x1b[0m \x1b[90mTK:\x1b[0m\x1b[33m⣿⣿⣶⣀⣀\x1b[0m 54% 108.0K/200.0K \x1b[90mCC5?:\x1b[0m\x1b[33m⣿⣿⣿⣀⣀\x1b[0m \x1b[97m61\x1b[0m\x1b[90m%\x1b[0m \x1b[90m(13:33|1h0m)\x1b[0m \x1b[90mCCW?:\x1b[0m\x1b[97m⣿⣄⣀⣀⣀\x1b[0m \x1b[97m22\x1b[0m\x1b[90m%\x1b[0m \x1b[90m(5/19 07:13|18h40m)\x1b[0m \x1b[90mCCF?:\x1b[0m\x1b[38;5;208m⣿⣿⣿⣦⣀\x1b[0m \x1b[97m71\x1b[0m\x1b[90m%\x1b[0m \x1b[90m(5/19 07:13|18h40m)\x1b[0m \x1b[90m(6m ago)\x1b[0m",
    );
  });

  test("cache freshness uses a 5 minute threshold", async () => {
    const dir = join(tmpdir(), `statusline-cache-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const cacheFile = join(dir, "cache.json");
    try {
      await writeFile(
        cacheFile,
        JSON.stringify({ timestamp: 2000000000000 - 4 * 60 * 1000, data: extendedCache.data }),
      );
      expect(readCache(cacheFile, 2000000000000)?.stale).toBe(false);

      await writeFile(
        cacheFile,
        JSON.stringify({ timestamp: 2000000000000 - 6 * 60 * 1000, data: extendedCache.data }),
      );
      expect(readCache(cacheFile, 2000000000000)?.stale).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("stale age suffix is emitted once only when cached limits render", () => {
    expect(
      renderStatusline(
        { model: { display_name: "Sonnet 4.5" } },
        {
          cache: {
            data: extendedCache.data,
            stale: true,
            timestamp: 2000000000000 - 6 * 60 * 1000,
          },
          color: false,
          now: 2000000000000,
        },
      ),
    ).toBe(
      "Sonnet 4.5 CC5?:⣿⣿⣿⣀⣀ 61% (13:33|1h0m) CCW?:⣿⣄⣀⣀⣀ 22% (5/19 07:13|18h40m) CCF?:⣿⣿⣿⣦⣀ 71% (5/19 07:13|18h40m) (6m ago)",
    );

    expect(
      renderStatusline(
        { model: { display_name: "Sonnet 4.5" } },
        {
          cache: {
            data: extendedCache.data,
            stale: false,
            timestamp: 2000000000000 - 4 * 60 * 1000,
          },
          color: false,
          now: 2000000000000,
        },
      ),
    ).not.toContain("ago");

    expect(
      renderStatusline(
        { model: { display_name: "Sonnet 4.5" } },
        {
          cache: { data: {}, stale: true, timestamp: 2000000000000 - 6 * 60 * 1000 },
          color: false,
          now: 2000000000000,
        },
      ),
    ).toBe("Sonnet 4.5");
  });

  test("未来の timestamp を持つ cache は stale 扱いにする", async () => {
    const dir = join(tmpdir(), `statusline-poison-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const cacheFile = join(dir, "cache.json");
    try {
      await writeFile(
        cacheFile,
        JSON.stringify({ timestamp: 2000000000000 + 60 * 60 * 1000, data: extendedCache.data }),
      );
      expect(readCache(cacheFile, 2000000000000)?.stale).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("未来の lastAttempt が書かれていても fetch は skip されない", async () => {
    const dir = join(tmpdir(), `statusline-poison-fetch-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "limits-fetch.mjs"), "");
    await writeFile(join(dir, ".extended-approved"), "");
    const cacheFile = join(dir, "cache.json");
    let spawned = 0;
    try {
      await writeFile(
        cacheFile,
        JSON.stringify({
          timestamp: 2000000000000 + 60 * 60 * 1000,
          lastAttempt: 2000000000000 + 60 * 60 * 1000,
          data: extendedCache.data,
        }),
      );
      const didSpawn = maybeSpawnLimitsFetch({
        scriptDir: dir,
        cacheFile,
        now: 2000000000000,
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

  test("fetcher が存在しても同意マーカーが無ければ spawn しない", async () => {
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
      expect(didSpawn).toBe(false);
      expect(spawned).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fetcher と同意マーカーが存在し取得間隔を過ぎていれば spawn する", async () => {
    const dir = join(tmpdir(), `statusline-limits-approved-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "limits-fetch.mjs"), "");
    await writeFile(join(dir, ".extended-approved"), "");
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
