import { access, copyFile, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  maybeSpawnLimitsFetch,
  needsExtendedReapproval,
  parseInput,
  readCache,
  renderStatusline,
} from "./statusline.mjs";

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

async function runStatusline(scriptPath: string, home: string) {
  const proc = Bun.spawn({
    cmd: [process.execPath, scriptPath],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
  });
  proc.stdin.write(JSON.stringify({ model: { display_name: "Sonnet 4.5" } }));
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("statusline.mjs", () => {
  test("CLI は fetcher が存在し同意マーカーが無ければ再承認を案内し marker を作らない", async () => {
    const dir = join(tmpdir(), `statusline-cli-reapproval-${process.pid}-${Date.now()}`);
    const runtimeDir = join(dir, "runtime");
    const home = join(dir, "home");
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(home, { recursive: true });
    await copyFile(
      join(process.cwd(), "scripts", "statusline.mjs"),
      join(runtimeDir, "statusline.mjs"),
    );
    await writeFile(join(runtimeDir, "limits-fetch.mjs"), "");

    try {
      const result = await runStatusline(join(runtimeDir, "statusline.mjs"), home);
      expect(result).toEqual({
        stdout: "Sonnet 4.5 Extended 要再承認 → /statusline-limits:install\n",
        stderr: "",
        code: 0,
      });
      await expect(access(join(runtimeDir, ".extended-approved"))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("CLI は fetcher が無ければ従来と byte-identical な出力を返す", async () => {
    const dir = join(tmpdir(), `statusline-cli-core-${process.pid}-${Date.now()}`);
    const runtimeDir = join(dir, "runtime");
    const home = join(dir, "home");
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(home, { recursive: true });
    await copyFile(
      join(process.cwd(), "scripts", "statusline.mjs"),
      join(runtimeDir, "statusline.mjs"),
    );

    try {
      expect(await runStatusline(join(runtimeDir, "statusline.mjs"), home)).toEqual({
        stdout: "Sonnet 4.5\n",
        stderr: "",
        code: 0,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fetcher が存在し同意マーカーが無ければ Extended 再承認が必要", () => {
    const paths: string[] = [];
    const required = needsExtendedReapproval({
      scriptDir: "/statusline-limits",
      statImpl: (path: string) => {
        paths.push(path);
        if (path.endsWith("limits-fetch.mjs")) return { isFile: () => true };
        throw new Error("missing");
      },
    });

    expect(required).toBe(true);
    expect(paths).toEqual([
      "/statusline-limits/limits-fetch.mjs",
      "/statusline-limits/.extended-approved",
    ]);
  });

  test("同意マーカーが存在するか fetcher が無ければ Extended 再承認は不要", () => {
    expect(
      needsExtendedReapproval({
        scriptDir: "/statusline-limits",
        statImpl: () => ({ isFile: () => true }),
      }),
    ).toBe(false);
    expect(
      needsExtendedReapproval({
        scriptDir: "/statusline-limits",
        statImpl: () => {
          throw new Error("missing");
        },
      }),
    ).toBe(false);
  });

  test("Extended 再承認が必要なら install コマンドを描画する", () => {
    expect(
      renderStatusline(fixture, {
        cache: extendedCache,
        color: false,
        now: 2000000000000,
        extendedReapprovalRequired: true,
      }),
    ).toContain("Extended 要再承認 → /statusline-limits:install");
  });

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

  test("未来 timestamp の stale age suffix は 0m ago に丸める", () => {
    expect(
      renderStatusline(
        { model: { display_name: "Sonnet 4.5" } },
        {
          cache: {
            data: extendedCache.data,
            stale: true,
            timestamp: 2000000000000 + 60 * 60 * 1000,
          },
          color: false,
          now: 2000000000000,
        },
      ),
    ).toContain("(0m ago)");
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

  test("429 連続失敗時は fetch 間隔を指数的に伸ばし上限で頭打ちする", async () => {
    const dir = join(tmpdir(), `statusline-backoff-${process.pid}-${Date.now()}`);
    const cacheFile = join(dir, "cache.json");
    const now = 2000000000000;
    let spawned = 0;
    const spawnImpl = () => {
      spawned += 1;
      return { unref() {} };
    };
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "limits-fetch.mjs"), "");
      await writeFile(join(dir, ".extended-approved"), "");

      await writeFile(
        cacheFile,
        JSON.stringify({
          timestamp: now - 60 * 60 * 1000,
          lastAttempt: now - 119 * 1000,
          consecutiveFailures: 2,
          lastError: { status: 429, type: "rate_limit", at: now - 119 * 1000 },
          data: extendedCache.data,
        }),
      );
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile, now, spawnImpl })).toBe(false);

      await writeFile(
        cacheFile,
        JSON.stringify({
          timestamp: now - 60 * 60 * 1000,
          lastAttempt: now - 121 * 1000,
          consecutiveFailures: 2,
          lastError: { status: 429, type: "rate_limit", at: now - 121 * 1000 },
          data: extendedCache.data,
        }),
      );
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile, now, spawnImpl })).toBe(true);

      await rm(join(dir, ".fetch.lock"), { recursive: true, force: true });
      await writeFile(
        cacheFile,
        JSON.stringify({
          timestamp: now - 60 * 60 * 1000,
          lastAttempt: now - 1799 * 1000,
          consecutiveFailures: 20,
          lastError: { status: 429, type: "rate_limit", at: now - 1799 * 1000 },
          data: extendedCache.data,
        }),
      );
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile, now, spawnImpl })).toBe(false);

      await writeFile(
        cacheFile,
        JSON.stringify({
          timestamp: now - 60 * 60 * 1000,
          lastAttempt: now - 1801 * 1000,
          consecutiveFailures: 20,
          lastError: { status: 429, type: "rate_limit", at: now - 1801 * 1000 },
          data: extendedCache.data,
        }),
      );
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile, now, spawnImpl })).toBe(true);
      expect(spawned).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("成功後の cache はバックオフなしの通常間隔で fetch 判定する", async () => {
    const dir = join(tmpdir(), `statusline-backoff-reset-${process.pid}-${Date.now()}`);
    const cacheFile = join(dir, "cache.json");
    const now = 2000000000000;
    let spawned = 0;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "limits-fetch.mjs"), "");
      await writeFile(join(dir, ".extended-approved"), "");
      await writeFile(
        cacheFile,
        JSON.stringify({ timestamp: now - 61 * 1000, lastAttempt: now - 61 * 1000, data: {} }),
      );

      expect(
        maybeSpawnLimitsFetch({
          scriptDir: dir,
          cacheFile,
          now,
          spawnImpl: () => {
            spawned += 1;
            return { unref() {} };
          },
        }),
      ).toBe(true);
      expect(spawned).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("lock 保持中は二重 spawn せず stale lock は回収する", async () => {
    const dir = join(tmpdir(), `statusline-lock-${process.pid}-${Date.now()}`);
    let spawned = 0;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "limits-fetch.mjs"), "");
      await writeFile(join(dir, ".extended-approved"), "");

      const spawnImpl = () => {
        spawned += 1;
        return { unref() {} };
      };
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile: join(dir, "cache.json"), spawnImpl })).toBe(
        true,
      );
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile: join(dir, "cache.json"), spawnImpl })).toBe(
        false,
      );

      const stale = new Date(Date.now() - 31 * 60 * 1000);
      await utimes(join(dir, ".fetch.lock"), stale, stale);
      expect(maybeSpawnLimitsFetch({ scriptDir: dir, cacheFile: join(dir, "cache.json"), spawnImpl })).toBe(
        true,
      );
      expect(spawned).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("stale lock takeover 敗者は他プロセスの新 lock を削除せず spawn しない", async () => {
    const dir = join(tmpdir(), `statusline-lock-race-${process.pid}-${Date.now()}`);
    const cacheFile = join(dir, "cache.json");
    const lockDir = join(dir, ".fetch.lock");
    let spawned = 0;
    let removedActiveLock = false;
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(join(dir, "limits-fetch.mjs"), "");
      await writeFile(join(dir, ".extended-approved"), "");

      const didSpawn = maybeSpawnLimitsFetch({
        scriptDir: dir,
        cacheFile,
        now: 2000000000000,
        spawnImpl: () => {
          spawned += 1;
          return { unref() {} };
        },
        lockFs: {
          mkdirSync(path: string) {
            if (path === lockDir) {
              const error = new Error("exists") as Error & { code: string };
              error.code = "EEXIST";
              throw error;
            }
          },
          statSync(path: string) {
            if (path === lockDir) return { mtimeMs: 2000000000000 - 31 * 60 * 1000 };
            throw new Error("unexpected stat");
          },
          renameSync() {
            const error = new Error("already reclaimed") as Error & { code: string };
            error.code = "ENOENT";
            throw error;
          },
          rmSync(path: string) {
            if (path === lockDir) removedActiveLock = true;
          },
        },
      });

      expect(didSpawn).toBe(false);
      expect(spawned).toBe(0);
      expect(removedActiveLock).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("spawn 同期失敗時は lock を掃除して false を返す", async () => {
    const dir = join(tmpdir(), `statusline-spawn-fail-${process.pid}-${Date.now()}`);
    const cacheFile = join(dir, "cache.json");
    const lockDir = join(dir, ".fetch.lock");
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "limits-fetch.mjs"), "");
      await writeFile(join(dir, ".extended-approved"), "");

      expect(
        maybeSpawnLimitsFetch({
          scriptDir: dir,
          cacheFile,
          spawnImpl: () => {
            throw new Error("spawn failed");
          },
        }),
      ).toBe(false);
      await expect(access(lockDir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
